/** Title case for interface labels; caller-owned names and identifiers remain untouched. */
export function headingCase(label:string):string {
  const small=new Set(['a','an','the','and','as','at','but','by','for','from','in','into','nor','of','on','or','per','so','than','to','via','with','within']);
  const words=[...label.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu)];
  let index=0;
  return label.replace(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu,(word,offset:number)=>{
    const current=index++;
    if(/[A-Z].*[A-Z]/.test(word)||/\d/.test(word))return word;
    if(current>0&&current<words.length-1&&label[offset-1]!=='-'&&small.has(word.toLowerCase()))return word.toLowerCase();
    return word.charAt(0).toUpperCase()+word.slice(1);
  });
}
