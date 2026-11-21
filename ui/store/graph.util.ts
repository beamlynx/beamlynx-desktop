// Generate a palette of contrasting modern colors
const LightColors = ['#ff4e50', '#ff9f51', '#ffea51', '#4caf50', '#64b6ac'];
const DarkColors = ['#cf6679', '#d4995c', '#e6c07b', '#98c379', '#61afef'];

/**
 * Get the color for the schema. Note: this function probably has collisions.
 * TODO: Keep track of the schemas and colors to avoid collisions.
 */
export const getSchemaColor = (schema: string | null, isDark: boolean = false) => {
  if (!schema) schema = 'public';
  const hash = schema.split('').reduce((acc, x) => acc + x.charCodeAt(0), 0);
  const colors = isDark ? DarkColors : LightColors;
  const publicColor = isDark ? '#4b5263' : '#FFF';
  const color = schema === 'public' ? publicColor : colors[hash % colors.length];
  return { schema, color };
};

/** Palette for result column tints (index-based so each table gets a distinct color). */
const ResultColumnLight = [
  '#e3f2fd', '#fff3e0', '#f3e5f5', '#e8f5e9', '#e0f7fa',
  '#fce4ec', '#f1f8e9', '#e8eaf6', '#fff8e1', '#efebe9',
];
const ResultColumnDark = [
  '#1e3a5f', '#4a3728', '#3d2d45', '#1e4620', '#1a3d42',
  '#4a2035', '#2d3d22', '#2c2d45', '#4a4020', '#3d3835',
];

/**
 * Returns a background color by table index (order in selected-tables).
 * Use this when you have the canonical table order so each table gets a unique color.
 */
export const getColorByTableIndex = (index: number, isDark: boolean = false): string => {
  const colors = isDark ? ResultColumnDark : ResultColumnLight;
  return colors[index % colors.length];
};
