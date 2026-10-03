import {ValidationError} from '@/shared/errors';

/** Malformed caller JSON is a400; internal request-stream failures stay diagnosable. */
export async function readJsonBody(req:{json:()=>Promise<unknown>}):Promise<unknown> {
  try {return await req.json();}
  catch(error) {
    if(error instanceof SyntaxError) throw new ValidationError('Request body must contain valid JSON');
    throw error;
  }
}
