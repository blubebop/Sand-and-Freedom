import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ganache from 'ganache';
import {BrowserProvider, ContractFactory, parseEther, id, ZeroHash} from 'ethers';
const artifact = JSON.parse(fs.readFileSync(new URL('../site/artifact.json', import.meta.url)));
const price = parseEther('0.25');
const json = '{"name":"Test gladiator","attributes":[]}';
async function setup(chainId=33111) {
  fs.mkdirSync('.test-data',{recursive:true});
  const dbPath=fs.mkdtempSync('.test-data/chain-');
  const rpc = ganache.provider({database:{dbPath},logging:{quiet:true},chain:{chainId,hardfork:'shanghai'},wallet:{totalAccounts:4}});
  const provider = new BrowserProvider(rpc); provider.pollingInterval=10;
  const [admin,buyer,other,treasury]=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));
  const factory=new ContractFactory(artifact.abi,artifact.bytecode,admin);
  return {rpc,provider,admin,buyer,other,treasury,factory};
}
async function deployed(t) {
  const s=await setup(); t.after(()=>s.rpc.disconnect());
  s.c=await s.factory.deploy(await s.admin.getAddress(),await s.treasury.getAddress());
  await s.c.waitForDeployment(); return s;
}
const sent=async p=>(await p).wait();
test('rejects mainnet deployment',async t=>{
  const s=await setup(33139);t.after(()=>s.rpc.disconnect());
  await assert.rejects(s.factory.deploy(await s.admin.getAddress(),await s.treasury.getAddress()));
});
test('exact test fee, sequential unlimited minting, interfaces, active transfer locks',async t=>{
  const {c,buyer,other}=await deployed(t);
  await assert.rejects(c.connect(buyer).mint({value:price-1n}));
  await assert.rejects(c.connect(buyer).mint({value:price+1n}));
  for(let i=1;i<=3;i++) await sent(c.connect(buyer).mint({value:price}));
  assert.equal(await c.nextTokenId(),4n);
  assert.equal(await c.balanceOf(await buyer.getAddress()),3n);
  assert.equal(await c.locked(1),true);
  for(const iface of ['0x80ac58cd','0xb45a3c0e','0x49064906']) assert.equal(await c.supportsInterface(iface),true);
  await sent(c.connect(buyer).approve(await other.getAddress(),1));
  await assert.rejects(c.connect(other).transferFrom(await buyer.getAddress(),await other.getAddress(),1));
  await assert.rejects(c.connect(buyer)['safeTransferFrom(address,address,uint256)'](await buyer.getAddress(),await other.getAddress(),1));
  await assert.rejects(c.locked(999));
});
test('only authority checkpoints; revisions prevent stale overwrite',async t=>{
  const {c,buyer}=await deployed(t);await sent(c.connect(buyer).mint({value:price}));
  await assert.rejects(c.connect(buyer).checkpoint(1,0,id('save'),json));
  await assert.rejects(c.checkpoint(1,0,ZeroHash,json));
  await sent(c.checkpoint(1,0,id('save'),json));
  assert.equal(await c.revision(1),1n);
  assert.equal(await c.saveHash(1),id('save'));
  await assert.rejects(c.checkpoint(1,0,id('old'),json));
  assert.equal(Buffer.from((await c.tokenURI(1)).split(',')[1],'base64').toString(),json);
});
test('death permanently locks both transfers and all metadata updates',async t=>{
  const {c,buyer,other}=await deployed(t);await sent(c.connect(buyer).mint({value:price}));
  await sent(c.finalize(1,0,1,id('dead'),json));
  assert.equal(await c.life(1),1n);assert.equal(await c.locked(1),true);
  await assert.rejects(c.finalize(1,1,2,id('revive'),json));
  await assert.rejects(c.checkpoint(1,1,id('edit'),json));
  await assert.rejects(c.connect(buyer).transferFrom(await buyer.getAddress(),await other.getAddress(),1));
});
test('victory unlocks trading but freezes outcome and metadata',async t=>{
  const {c,buyer,other}=await deployed(t);await sent(c.connect(buyer).mint({value:price}));
  await assert.rejects(c.connect(buyer).finalize(1,0,2,id('cheat'),json));
  await assert.rejects(c.finalize(1,0,0,id('invalid'),json));
  await sent(c.finalize(1,0,2,id('won'),json));
  assert.equal(await c.locked(1),false);
  await sent(c.connect(buyer).transferFrom(await buyer.getAddress(),await other.getAddress(),1));
  assert.equal(await c.ownerOf(1),await other.getAddress());
  await assert.rejects(c.finalize(1,1,1,id('kill'),json));
  await assert.rejects(c.checkpoint(1,1,id('edit'),json));
});
test('mint proceeds go only to immutable treasury',async t=>{
  const {c,buyer,treasury,rpc}=await deployed(t);await sent(c.connect(buyer).mint({value:price}));
  const bal=async()=>BigInt(await rpc.request({method:'eth_getBalance',params:[await treasury.getAddress(),'latest']}));
  const before=await bal();await sent(c.connect(buyer).withdraw());
  assert.equal((await bal())-before,price);
});
