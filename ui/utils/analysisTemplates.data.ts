import { GlobalStore } from '../store/global.store';
import { AnalysisTemplate, runAnalysisFromExpressions } from './analysisTemplates';

// Hardcoded analysis templates
export const AnalysisTemplates: AnalysisTemplate[] = [
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
