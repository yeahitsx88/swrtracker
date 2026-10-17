import ts from 'typescript';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),methods=new Set(['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']);
async function files(dir){const result=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())result.push(...await files(p));else if(e.name.endsWith('.ts'))result.push(p);}return result;}
const sources=new Map();for(const p of await files(path.join(root,'src')))sources.set(p.replaceAll('\\','/'),await fs.readFile(p,'utf8'));
const modules=new Map();
for(const [p,text]of sources){const ast=ts.createSourceFile(p,text,ts.ScriptTarget.Latest,true),imports=[],exports=[];
 for(const s of ast.statements){if(ts.isImportDeclaration(s)||ts.isExportDeclaration(s)){if(s.moduleSpecifier&&ts.isStringLiteral(s.moduleSpecifier)){const spec=s.moduleSpecifier.text;if(spec.startsWith('@/')||spec.startsWith('.')){const base=(spec.startsWith('@/')?path.join(root,'src',spec.slice(2)):path.resolve(path.dirname(p),spec)).replaceAll('\\','/');const dep=[base+'.ts',base+'/index.ts'].find(p=>sources.has(p));if(dep)imports.push(dep);}}}
  if(s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)){if(ts.isFunctionDeclaration(s)&&s.name&&methods.has(s.name.text))exports.push(s.name.text);if(ts.isVariableStatement(s))for(const d of s.declarationList.declarations)if(ts.isIdentifier(d.name)&&methods.has(d.name.text))exports.push(d.name.text);}
  if(ts.isExportDeclaration(s)&&s.exportClause&&ts.isNamedExports(s.exportClause))for(const e of s.exportClause.elements)if(methods.has(e.name.text))exports.push(e.name.text);
 }
 modules.set(p,{text,imports,exports});
}
const relative=p=>path.relative(root,p).replaceAll('\\','/');
const rows=[];
for(const [p,m]of modules)if(p.includes('/src/app/api/')&&p.endsWith('/route.ts')){
 const reachable=new Set();function visit(p){if(reachable.has(p))return;reachable.add(p);for(const dep of modules.get(p)?.imports??[])visit(dep);}visit(p);
 const find=regex=>[...reachable].filter(p=>regex.test(modules.get(p).text)).map(relative);
 const route='/api/'+relative(p).split('src/app/api/')[1].replace(/\/route\.ts$/,'');
 for(const method of m.exports)rows.push({route,method,source:relative(p),observed:m.text.includes('observeProjectRoute'),authentication:find(/requireActiveAuth|requireAuth\(|getTicketRouteContext\(/),authority:find(/assertProjectAdministrator|assertTenantAdmin|authorize|resolveVisibility|getProjectRole|lockDraftActor/),lifecycle:find(/acquireTenantLifecycleLock|coordinateAuthenticatedMutation|withTicketMutation|withTicketRead/),replay:find(/executeIdempotentHttpMutation|executeAuthorizedTicketMutation/),evidence:find(/appendAdministrativeEvent|ticket_events|appendEvent/)});
}
await fs.mkdir('audits/alpha1-reconciliation',{recursive:true});
await fs.writeFile('audits/alpha1-reconciliation/route-inventory.json',JSON.stringify({note:'AST method inventory and transitive source trace. Reachability is not proof that every branch invokes a guard; pair with manual review and HTTP/SQL evidence.',routeFiles:new Set(rows.map(r=>r.source)).size,observedRouteFiles:new Set(rows.filter(r=>r.observed).map(r=>r.source)).size,methods:rows},null,2)+'\n');
console.log('Inventoried '+rows.length+' methods');
