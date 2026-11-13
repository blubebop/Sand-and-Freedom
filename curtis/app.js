import {BrowserProvider,Contract,ContractFactory,getAddress,isAddress,parseEther,formatEther,keccak256,toUtf8Bytes} from './ethers.min.js';
const ADMIN=getAddress('0x9bdcc6c1bc968a31a45f1c1e74a2f40a18109e61');
const CHAIN='0x8157', RPC='https://curtis.rpc.caldera.xyz/http', EXPLORER='https://curtis.explorer.caldera.xyz';
const $=id=>document.getElementById(id);
const artifact=await fetch('./artifact.json').then(r=>{if(!r.ok)throw Error('Contract build is unavailable.');return r.json()});
let provider,signer,account,contract,busy=false;
const storageKey='sf_curtis_contract:'+ADMIN;
const message=s=>$('status').textContent=s;
$('adminAddress').textContent=ADMIN;
$('address').value=new URL(location.href).searchParams.get('contract')||localStorage.getItem(storageKey)||'';
function controls(){
  for(const id of ['deploy','mint','estimate','inspect','checkpoint','death','victory','transfer','withdraw','copy']) $(id).disabled=true;
  $('connect').disabled=busy;$('load').disabled=busy;
  if(busy)return;
  $('deploy').disabled=account!==ADMIN;
  if(contract){for(const id of ['mint','estimate','inspect','transfer','withdraw','copy'])$(id).disabled=false;
    for(const id of ['checkpoint','death','victory'])$(id).disabled=account!==ADMIN;}
}
async function run(fn){if(busy)return;busy=true;controls();try{await fn()}catch(e){message(e.shortMessage||e.reason||e.message||'The wallet declined the request.')}finally{busy=false;controls()}}
async function requireChain(){
  if(!window.ethereum)throw Error('Open this page in a browser with your wallet extension, or your wallet’s built-in browser.');
  if(await window.ethereum.request({method:'eth_chainId'})!==CHAIN)throw Error('Switch your wallet to Curtis testnet before continuing.');
  const accounts=await window.ethereum.request({method:'eth_accounts'});
  if(!accounts.length||getAddress(accounts[0])!==account)throw Error('Wallet changed. Connect again before continuing.');
}
function showTx(hash){$('tx').replaceChildren();const a=document.createElement('a');a.href=EXPLORER+'/tx/'+hash;a.target='_blank';a.rel='noopener';a.textContent='View transaction: '+hash;$('tx').append(a)}
async function submitted(tx){showTx(tx.hash);message('Transaction submitted. Waiting for confirmation…');const r=await tx.wait();if(r.status!==1)throw Error('Transaction reverted.');return r}
async function connect(){
  if(!window.ethereum)throw Error('Open this link in MetaMask, Rabby, or another Ethereum-compatible wallet browser.');
  await window.ethereum.request({method:'eth_requestAccounts'});
  try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN}]})}
  catch(e){if(e.code!==4902)throw e;await window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:CHAIN,chainName:'ApeChain Curtis Testnet',nativeCurrency:{name:'Test ApeCoin',symbol:'APE',decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]}]});await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN}]})}
  provider=new BrowserProvider(window.ethereum);signer=await provider.getSigner();account=getAddress(await signer.getAddress());await requireChain();
  $('wallet').textContent=account+' · '+formatEther(await provider.getBalance(account))+' test APE';message('Connected to Curtis.');
  if($('address').value)await load();
}
async function load(){
  await requireChain();contract=null;
  const address=getAddress($('address').value.trim());
  if(await provider.getCode(address)==='0x')throw Error('There is no contract at that address on Curtis.');
  const candidate=new Contract(address,artifact.abi,signer);
  if((await candidate.name())!=='Sand & Freedom - CURTIS TEST'||(await candidate.owner())!==ADMIN||(await candidate.treasury())!==ADMIN||(await candidate.TEST_MINT_PRICE())!==parseEther('0.25'))throw Error('This address is not the expected test collection and administrator.');
  contract=candidate;localStorage.setItem(storageKey,address);$('address').value=address;
  $('contractInfo').textContent='Loaded '+address;
  message('Curtis test contract loaded. Ready to mint or inspect.');
}
async function deploy(){
  await requireChain();if(account!==ADMIN)throw Error('Connect the designated test admin wallet.');
  const factory=new ContractFactory(artifact.abi,artifact.bytecode,signer);
  const request=await factory.getDeployTransaction(ADMIN,ADMIN);
  const gas=await signer.estimateGas(request);const fees=await provider.getFeeData();
  message('Deployment estimate: '+formatEther(gas*(fees.maxFeePerGas||fees.gasPrice))+' test APE. Review the final gas fee in your wallet.');
  const c=await factory.deploy(ADMIN,ADMIN);const tx=c.deploymentTransaction();
  localStorage.setItem('sf_curtis_pending_deploy',JSON.stringify({hash:tx.hash,address:await c.getAddress()}));
  await submitted(tx);await c.waitForDeployment();$('address').value=await c.getAddress();await load();
  localStorage.removeItem('sf_curtis_pending_deploy');message('Contract deployed on Curtis. Copy its share link so other devices can use the same collection.');
}
async function estimate(){await requireChain();const gas=await contract.mint.estimateGas({value:parseEther('0.25')});const fees=await provider.getFeeData();$('gas').textContent='Estimated network fee: '+formatEther(gas*(fees.maxFeePerGas||fees.gasPrice))+' test APE, paid separately. Your wallet shows the final fee.';}
async function mint(){await requireChain();await estimate();const r=await submitted(await contract.mint({value:parseEther('0.25')}));
  for(const log of r.logs){try{const e=contract.interface.parseLog(log);if(e?.name==='Transfer'&&e.args.from==='0x0000000000000000000000000000000000000000')$('token').value=e.args.tokenId.toString()}catch{}}
  await inspect();message('Gladiator minted. It is active and transfer locked.');}
function token(){const raw=$('token').value;if(!/^[1-9]\d*$/.test(raw))throw Error('Enter a positive token ID.');return BigInt(raw)}
async function inspect(){await requireChain();const id=token();const [owner,life,rev,locked,uri,hash]=await Promise.all([contract.ownerOf(id),contract.life(id),contract.revision(id),contract.locked(id),contract.tokenURI(id),contract.saveHash(id)]);
  const meta=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(uri.split(',')[1]),c=>c.charCodeAt(0))));
  $('details').textContent=JSON.stringify({tokenId:String(id),owner,status:['Active','Permanent memorial','Victorious'][Number(life)],locked,revision:String(rev),saveHash:hash,metadata:meta},null,2);
  $('portrait').hidden=true;if(typeof meta.image==='string'&&meta.image.startsWith('data:image/svg+xml;base64,')){$('portrait').src=meta.image;$('portrait').hidden=false}
}
function int(id,min,max){const n=Number($(id).value);if(!Number.isInteger(n)||n<min||n>max)throw Error(id+' must be an integer between '+min+' and '+max);return n}
function metadata(outcome){
  const state=['Active','Permanent memorial','Victorious'][outcome];
  const armor=$('armor').value;const strength=int('strength',1,999),wins=int('wins',0,999);
  const record={name:$('name').value.trim()||'Gladiator',armor,strength,wins,achievement:$('achievement').value.trim(),status:state};
  const color=['#805432','#d7c9a4','#ad793b','#9ba8bb'][$('armor').selectedIndex];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="280" viewBox="0 0 120 140"><rect width="120" height="140" fill="#252328"/><path d="M12 126H108" stroke="#c29a59" stroke-width="2"/><path d="M43 102H53V124H41ZM67 102H77L79 124H67Z" fill="#a67450"/><path d="M40 87H80L85 107H35Z" fill="#7e2931"/><path d="M40 50H80L84 86H36Z" fill="${color}"/><path d="M40 62H80M39 72H81M37 82H83" stroke="#252328" stroke-width="3"/><path d="M33 52H40V83H27ZM80 52H87L93 83H84Z" fill="#c99364"/><path d="M45 21H75V46H45Z" fill="#c99364"/><path d="M43 19H77V29H43Z" fill="#302528"/><path d="M49 33H54M65 33H70" stroke="#222" stroke-width="3"/><path d="M51 44H69" stroke="#895638" stroke-width="2"/><path d="M28 82L22 87L42 109L46 105Z" fill="#cbd3df"/>${outcome===1?'<path d="M10 10L110 130M110 10L10 130" stroke="#847876" stroke-width="2" opacity=".5"/>':outcome===2?'<path d="M40 13L45 4L60 11L75 4L80 13Z" fill="#e6bc62"/>':''}</svg>`;
  return {record,json:JSON.stringify({name:record.name+' — TEST',description:'Curtis test simulation; not a verified game result.',image:'data:image/svg+xml;base64,'+btoa(svg),attributes:Object.entries(record).filter(([k])=>k!=='name').map(([trait_type,value])=>({trait_type,value}))})};
}
async function update(outcome){await requireChain();const id=token();if(account!==ADMIN)throw Error('Only the test administrator can simulate outcomes.');
  if(outcome&&!confirm(outcome===1?'Permanently lock this token as a memorial? This cannot be undone.':'Freeze this token as victorious and allow transfers? This cannot be undone.'))return;
  const {record,json}=metadata(outcome);const hash=keccak256(toUtf8Bytes(JSON.stringify(record)));const rev=await contract.revision(id);
  const tx=outcome?await contract.finalize(id,rev,outcome,hash,json):await contract.checkpoint(id,rev,hash,json);
  await submitted(tx);await inspect();message(outcome?'Final outcome recorded permanently.':'Test record updated.');
}
async function transfer(){await requireChain();const to=getAddress($('recipient').value.trim());if(await contract.locked(token()))throw Error('Only victorious gladiators can be transferred.');await submitted(await contract['safeTransferFrom(address,address,uint256)'](account,to,token()));await inspect();message('Victorious gladiator transferred.');}
const handlers={connect,deploy,load,mint,estimate,inspect,checkpoint:()=>update(0),death:()=>update(1),victory:()=>update(2),transfer,withdraw:async()=>{await requireChain();await submitted(await contract.withdraw());message('Mint proceeds sent to the fixed test treasury.');},copy:async()=>{const url=new URL(location.href);url.searchParams.set('contract',await contract.getAddress());await navigator.clipboard.writeText(url.href);message('Share link copied.');}};
for(const [id,fn]of Object.entries(handlers))$(id).addEventListener('click',()=>run(fn));
function reset(){account=null;contract=null;provider=null;signer=null;$('wallet').textContent='Wallet or network changed. Connect again.';controls();message('Reconnect to verify the selected wallet and Curtis network.');}
window.ethereum?.on?.('accountsChanged',reset);window.ethereum?.on?.('chainChanged',reset);
const pending=localStorage.getItem('sf_curtis_pending_deploy');if(pending){try{const p=JSON.parse(pending);if(isAddress(p.address)){$('address').value=p.address;message('A previous deployment was submitted. Connect and load the address below to check it.');showTx(p.hash)}}catch{}}
controls();
