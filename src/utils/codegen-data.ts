import { CodegenActionData } from '../types';

const ENTER_FRAME = ' >> internal:control=enter-frame >> ';

/**
 * Playwright ≤1.62 sends `{ frame, action }`; 1.63+ sends the bare action with the
 * iframe chain embedded in the selector — split it back into framePath.
 */
export function normalizeCodegenData(raw: unknown): CodegenActionData {
  if ((raw as CodegenActionData).action) return raw as CodegenActionData;

  const action = { ...(raw as CodegenActionData['action']) };
  const framePath = action.selector?.split(ENTER_FRAME) ?? [];
  action.selector = framePath.pop();

  return { frame: { framePath }, action };
}
