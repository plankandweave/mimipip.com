import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.createSourceFile('ProductConfigurator.tsx', fs.readFileSync('src/components/ProductConfigurator.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers: {name:string; unit:string; code:string}[] = [];
function visit(node:ts.Node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source)==='NumField') {
    const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
    const value = (name:string) => attrs.find(a=>a.name.getText(source)===name)?.initializer;
    const change = value('onChange');
    if (change && ts.isJsxExpression(change) && change.expression) handlers.push({name:value('name')?.getText(source).replaceAll('"','')??'',unit:value('label')?.getText(source).replaceAll('"','')??'',code:change.expression.getText(source)});
  }
  ts.forEachChild(node,visit);
}
visit(source);
test('editing any feet/inches field releases the saved exact size used by price and preview',()=>{
  assert.equal(handlers.length,4);
  for(const h of handlers){
    let exact:number[]|null=[84,96];
    const state={widthFeet:7,widthInches:0,heightFeet:8,heightInches:0};
    const context:any={...state,widthGiven:true,heightGiven:true,setExactReady:(v:null)=>{exact=v;},setWidthGiven:()=>{},setHeightGiven:()=>{},syncHeightToWidth:()=>{},syncWidthToHeight:()=>{}};
    for(const key of Object.keys(state)) context[`set${key[0].toUpperCase()}${key.slice(1)}`]=(v:number)=>{state[key as keyof typeof state]=v;};
    vm.runInNewContext(`(${h.code})(6)`,context);
    assert.equal(exact,null,`${h.name} ${h.unit} must release the restored size`);
    const width=state.widthFeet+state.widthInches/12,height=state.heightFeet+state.heightInches/12;
    const expected=h.name==='Width'?(h.unit==='ft'?9600:12000):(h.unit==='ft'?8400:11900);
    assert.equal(width*height*200,expected);
  }
});
