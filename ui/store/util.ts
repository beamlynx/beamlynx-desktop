export const prettifyExpression = (expression: string): string => {
  const parts = expression.split('|');
  return (
    parts
      .map(x => x.trim())
      .filter(Boolean)
      .join('\n | ') + '\n | '
  );
};
