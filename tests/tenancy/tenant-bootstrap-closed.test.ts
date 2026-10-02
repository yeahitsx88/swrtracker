import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/tenants/route';
test('public tenant creation is closed before reading caller payload',async()=>{
  const req=new NextRequest('http://localhost/api/tenants',{method:'POST',body:'invalid-json'});
  const response=await POST(req);
  assert.equal(response.status,404);
});