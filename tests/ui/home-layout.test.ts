import test from 'node:test';
import assert from 'node:assert/strict';
import {columnsOf,defaultLayout,moveCard,positionOf,restoreLayout,sameLayout,stepCard} from '@/components/ui/home-layout';

const ids=['Recent Requests','Request Status','Upcoming Need-By Dates','Saved Drafts','Queue Health'];

test('default layout fills the left column first, then the right', () => {
 assert.deepEqual(columnsOf(defaultLayout(ids),2),[ids.slice(0,3),ids.slice(3)]);
 assert.deepEqual(columnsOf(defaultLayout(ids),1),[ids]);
});

test('former saved order arrays migrate; unknown cards are dropped and new cards appended', () => {
 const restored=restoreLayout(['Queue Health','Retired Card','Recent Requests','Queue Health'],ids);
 assert.deepEqual(restored.order.slice(0,2),['Queue Health','Recent Requests']);
 assert.equal(restored.order.length,ids.length);
 assert.ok(!restored.order.includes('Retired Card'));
 for(const id of ids)assert.ok(restored.column[id]===0||restored.column[id]===1,id);
});

test('saved v2 layouts keep columns; invalid shapes fall back to the default', () => {
 const saved={order:['Saved Drafts','Recent Requests'],column:{'Saved Drafts':1,'Recent Requests':0,'Ghost':1}};
 const restored=restoreLayout(saved,ids);
 assert.equal(restored.column['Saved Drafts'],1);
 assert.equal(restored.column['Recent Requests'],0);
 assert.ok(!('Ghost' in restored.column));
 for(const bad of [null,'x',42,{order:'nope'}])assert.equal(restoreLayout(bad,ids).order.length,ids.length);
});

test('moving a card places it exactly in the target column slot without overlap or loss', () => {
 const base=defaultLayout(ids);
 const moved=moveCard(base,'Recent Requests',1,1,2);
 const [left,right]=columnsOf(moved,2);
 assert.deepEqual(right,['Saved Drafts','Recent Requests','Queue Health']);
 assert.deepEqual(left,['Request Status','Upcoming Need-By Dates']);
 assert.equal(new Set(moved.order).size,ids.length);
 assert.deepEqual(positionOf(moved,'Recent Requests',2),{column:1,index:1});
 const toEnd=moveCard(base,'Request Status',1,99,2);
 assert.equal(columnsOf(toEnd,2)[1]!.at(-1),'Request Status','out-of-range index clamps to the end');
 const emptyColumn=moveCard(moveCard(moveCard(base,'Saved Drafts',0,0,2),'Queue Health',0,0,2),'Recent Requests',1,0,2);
 assert.deepEqual(columnsOf(emptyColumn,2)[1],['Recent Requests'],'a card can be dropped into an empty column');
});

test('single-column moves change reading order but keep each card’s wide-screen column', () => {
 const base=defaultLayout(ids);
 const moved=moveCard(base,'Queue Health',0,0,1);
 assert.equal(moved.order[0],'Queue Health');
 assert.equal(moved.column['Queue Health'],base.column['Queue Health']);
});

test('keyboard steps move within and across columns and stop at the edges', () => {
 const base=defaultLayout(ids);
 assert.ok(sameLayout(stepCard(base,'Recent Requests','ArrowUp',2),base),'already first');
 assert.deepEqual(positionOf(stepCard(base,'Recent Requests','ArrowDown',2),'Recent Requests',2),{column:0,index:1});
 assert.deepEqual(positionOf(stepCard(base,'Recent Requests','ArrowRight',2),'Recent Requests',2),{column:1,index:0});
 assert.ok(sameLayout(stepCard(base,'Recent Requests','ArrowLeft',2),base),'already in the left column');
 assert.ok(sameLayout(stepCard(base,'Recent Requests','ArrowRight',1),base),'no column change on narrow screens');
 const last=stepCard(base,'Upcoming Need-By Dates','ArrowDown',2);
 assert.ok(sameLayout(last,base),'already last in its column');
});
