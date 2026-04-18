export const personaColors: Record<string, string> = {
  chad: '#5cc8d6',
  susan: '#d67ba0',
  arthur: '#d6c25c',
  leo: '#a78cd6',
  fern: '#5cd69b',
  blake: '#6ba0d6',
  penny: '#d69b5c',
  victoria: '#d67b8c',
  dr_chen: '#8c94d6',
  luna: '#c67bd6',
};

export const personaColorList = Object.values(personaColors);

export function personaColor(id: string | undefined | null): string {
  if (!id) return '#888888';
  return personaColors[id.toLowerCase()] ?? '#888888';
}
