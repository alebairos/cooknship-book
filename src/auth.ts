export function bearerOk(request: Request, token: string): boolean {
  const header = request.headers.get('Authorization');
  if (!header) return false;
  const [scheme, value] = header.split(' ', 2);
  return scheme === 'Bearer' && value === token;
}
