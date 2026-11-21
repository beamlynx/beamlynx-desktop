import { runInAction } from 'mobx';
import { GlobalStore } from '../store/global.store';
import { AnalysisTemplates } from './analysisTemplates.data';

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
  runInAction(() => {
    global.activeSessionId = firstSession.id;
  });

  // Clear all other existing sessions now that we have a new active session
  Object.keys(global.sessions).forEach(sessionId => {
    if (sessionId !== firstSession.id) {
      global.deleteSession(sessionId);
    }
  });

  // Set the pine expression for the first session
  runInAction(() => {
    firstSession.expression = expressions[0];
  });
  await firstSession.prettify();
  await firstSession.evaluate();

  // Process remaining expressions
  for (let i = 1; i < expressions.length; i++) {
    const session = global.createSession();
    sessionIds.push(session.id);

    runInAction(() => {
      session.expression = expressions[i];
    });
    await session.prettify();
    await session.evaluate();
  }

  return sessionIds;
};

// Function to run analysis based on template
export const runAnalysis = async (input: string, templateId: string, global: GlobalStore) => {
  const template = AnalysisTemplates.find(t => t.id === templateId);
  if (!template) {
    return;
  }
  const x = template.extract(input);
  if (!x) {
    return;
  }
  const sessionIds = await template.run(x, global);
  if (sessionIds.length > 0) {
    runInAction(() => {
      global.activeSessionId = sessionIds[0];
    });
  }
}; 