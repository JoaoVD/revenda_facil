/** Somente a origem configurada no servidor é confiável; não usar forwarded-host. */
export function trustedMutationOrigin(request: Request) {
  const canonical = new URL(process.env.APP_URL || request.url).origin;
  const origin = request.headers.get('origin');
  return origin === canonical;
}
