import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {middleware} from '@/middleware';
for(const path of ['/login','/register','/forgot-password','/reset-password'])test('public '+path+' defers cookie validity to server authentication instead of looping stale sessions',()=>{
 for(const cookie of ['', 'swr_session=expired-or-revoked']){
  const response=middleware(new NextRequest('https://owned.example'+path,{headers:{cookie}}));
  assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);
 }
});
test('missing session retains protected destination and query for sign-in',()=>{
 const response=middleware(new NextRequest('https://owned.example/projects/owned/requests?view=requests'));
 assert.equal(response.status,307);const location=new URL(response.headers.get('location')!);
 assert.equal(location.pathname,'/login');assert.equal(location.searchParams.get('returnTo'),'/projects/owned/requests?view=requests');
});
test('protected cookie requests remain subject to existing server-side current session validation',()=>{
 const response=middleware(new NextRequest('https://owned.example/projects/owned/home',{headers:{cookie:'swr_session=stale'}}));
 assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);
});
test('public API and invitation routes retain their existing authoritative handlers',()=>{
 for(const path of ['/api/auth/login','/api/account','/invite/owned'])assert.equal(middleware(new NextRequest('https://owned.example'+path)).status,200);
});

test('public entry marker replaces caller input and is route context only',()=>{
 const response=middleware(new NextRequest('https://owned.example/login',{headers:{'x-swr-auth-entry':'0'}}));
 assert.equal(response.headers.get('x-middleware-request-x-swr-auth-entry'),'1');
});
test('invitation and other paths remove caller-supplied public-entry markers',()=>{
 for(const path of ['/invite/owned','/api/auth/login','/projects/owned']){
  const response=middleware(new NextRequest('https://owned.example'+path,{headers:{cookie:'swr_session=stale','x-swr-auth-entry':'1'}}));
  assert.equal(response.headers.get('x-middleware-request-x-swr-auth-entry'),null);
 }
});
