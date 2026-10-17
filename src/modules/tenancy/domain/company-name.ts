/** Company identity preserves punctuation; capitalization and spacing do not distinguish names. */
export function companyNameKey(name:string):string {
  return name.trim().replace(/\s+/g,' ').toLowerCase();
}
