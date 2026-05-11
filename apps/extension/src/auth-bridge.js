export const AUTH_MESSAGE = 'ANNOTATED_AUTH_TOKEN';

export function isAnnotatedAuthMessage(event, webBase) {
  return event.origin === webBase
    && event.data?.type === AUTH_MESSAGE
    && typeof event.data.token === 'string'
    && event.data.token.length > 0;
}
