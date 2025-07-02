import { GlobalStore } from '../store/global.store';

export interface AnalysisTemplate {
  id: string;
  extract: (text: string) => string | null;
  run: (x: string, global: GlobalStore) => Promise<string[]>;
}

/**
 * Generic function to process an array of pine expressions
 * For each expression: creates session, prettifies, and evaluates (waits for results)
 */
export const runAnalysisFromExpressions = async (
  expressions: string[],
  global: GlobalStore
): Promise<string[]> => {
  if (expressions.length === 0) {
    return [];
  }

  const sessionIds: string[] = [];

  // Create the first session and set it as active immediately to avoid race conditions
  const firstSession = global.createSession();
  sessionIds.push(firstSession.id);
  global.activeSessionId = firstSession.id;

  // Clear all other existing sessions now that we have a new active session
  Object.keys(global.sessions).forEach(sessionId => {
    if (sessionId !== firstSession.id) {
      global.deleteSession(sessionId);
    }
  });

  // Set the pine expression for the first session
  firstSession.expression = expressions[0];
  firstSession.prettify();
  await firstSession.evaluate();

  // Process remaining expressions
  for (let i = 1; i < expressions.length; i++) {
    const session = global.createSession();
    sessionIds.push(session.id);
    
    session.expression = expressions[i];
    session.prettify();
    await session.evaluate();
  }

  return sessionIds;
};

// Hardcoded analysis templates
export const analysisTemplates: AnalysisTemplate[] = [
  {
    id: 'Collector Request using Readable ID',
    extract: (text: string) => {
      const matches = text.match(/.*?(\d+).*?/);
      return matches ? matches[1] : null;
    },
    run: async (x: string, global: GlobalStore) => {
      const expressions = [
        `requests.request | readable_id = '${x}' ::text | public.tenant .tenant_id :parent | s: title, emailSender, deletedAt, live`,
        `requests.request | readable_id = '${x}' ::text`
      ];
      return await runAnalysisFromExpressions(expressions, global);
    },
  },
];

// Hardcoded analysis functions
export const runTenantCompanyAnalysis = async (input: string, global: GlobalStore) => {
  const expressions = ['tenant | 1', 'company | 2'];
  await runAnalysisFromExpressions(expressions, global);
};

export const runDownloadFilesAnalysis = async (input: string, global: GlobalStore) => {
  const expressions = ['downloads | 1', 'files | 2'];
  await runAnalysisFromExpressions(expressions, global);
};

export const runUserActivityAnalysis = async (input: string, global: GlobalStore) => {
  // Add your expressions here when ready
  const expressions: string[] = [];
  if (expressions.length > 0) {
    await runAnalysisFromExpressions(expressions, global);
  }
};

// Function to run analysis based on template
export const runAnalysis = async (input: string, templateId: string, global: GlobalStore) => {
  const template = analysisTemplates.find(t => t.id === templateId);
  if (!template) {
    return;
  }
  const x = template.extract(input);
  if (!x) {
    return;
  }
  const sessionIds = await template.run(x, global);
  if (sessionIds.length > 0) {
    global.activeSessionId = sessionIds[0];
  }
};
