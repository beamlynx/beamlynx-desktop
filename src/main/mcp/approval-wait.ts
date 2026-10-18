// run_query's side of an approval (see investigations.ts): a query refused
// for a hidden column the user could allow comes back with `approval`, and
// the call waits for their answer before it returns. Kept apart from
// stdio-relay.ts, which needs Electron, so it can be tested on its own.

/** A control-plane request, as stdio-relay.ts makes them. */
export type ControlPlaneRequest = (method: 'GET' | 'POST', path: string, body?: unknown) => Promise<any>;

type Approval = { id: string; column?: string; table?: { schema?: string | null; table?: string } };

const nameOf = (approval: Approval) =>
  [approval.table?.table, approval.column].filter(Boolean).join('.') || 'a hidden column';

/**
 * Runs the query, and while it comes back waiting on an approval, waits for
 * the user's answer and runs it again. A re-run can be refused for a second
 * hidden column, since pine-lang names only the first it finds, so this
 * keeps going until a run needs no approval, the user declines, or the
 * deadline passes. Returns the text for the agent, and whether it failed.
 */
export async function runWithApprovals(
  request: ControlPlaneRequest,
  body: Record<string, unknown>,
  format: (result: Record<string, unknown>) => string,
  timeoutMs: number,
  now: () => number = Date.now,
): Promise<{ text: string; isError: boolean }> {
  const deadline = now() + timeoutMs;
  const allowed: string[] = [];
  let result: Record<string, any> = (await request('POST', '/query', body))?.result ?? {};

  while (result.approval?.id) {
    const approval = result.approval as Approval;
    let outcome: { allowed?: boolean; comment?: string } | undefined;
    while (!outcome && now() < deadline) {
      const answer = await request('GET', `/approval/${encodeURIComponent(approval.id)}`);
      if (answer?.status === 'resolved') outcome = answer.outcome ?? {};
    }
    if (!outcome) {
      return {
        isError: true,
        text:
          `${format(result)}\n\nThe user was asked in beamlynx to allow ${nameOf(approval)}, and hasn't ` +
          'answered yet. Run the query again to keep waiting, or carry on without it.',
      };
    }
    if (!outcome.allowed) {
      const comment = typeof outcome.comment === 'string' && outcome.comment.trim();
      return {
        isError: true,
        text: `${format(result)}\n\nThe user declined to show you ${nameOf(approval)}` + (comment ? `: "${comment}"` : '.'),
      };
    }
    allowed.push(nameOf(approval));
    result = (await request('POST', '/query', body))?.result ?? {};
  }

  const preface = allowed.length
    ? `The user allowed you to see ${allowed.join(' and ')}, and the query ran again.\n\n`
    : '';
  return { isError: !!result.error, text: preface + format(result) };
}
