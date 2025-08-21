
import { firebaseConfig } from './firebase.js';
import { auth, db, ADMIN_MATRICULAS } from './auth.js';
import {
  initializeApp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc,
  getDocs, query, where, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Boot (auth.js already created app), but safeguard if module imported directly
initializeApp(firebaseConfig);

// Elements
const sidebar = document.querySelector('nav.sidebar');
const hamburger = document.querySelector('.hamburger');
hamburger?.addEventListener('click', ()=> sidebar.classList.toggle('open'));

const sectionAbastecimento = document.getElementById('section-abastecimento');
const sectionRelatorios = document.getElementById('section-relatorios');
const linkAbast = document.getElementById('link-abastecimento');
const linkRel = document.getElementById('link-relatorios');
const btnLogout = document.getElementById('btn-logout');
const btnChangePass = document.getElementById('btn-changePass');
const userBadge = document.getElementById('user-badge');
const whoLabel = document.getElementById('who');

let currentUser = null; // { uid, email, matricula, nome, role }
let currentCaixaId = null;

// Switch sections
function showSection(key){
  sectionAbastecimento.classList.add('hidden');
  sectionRelatorios.classList.add('hidden');
  if(key === 'abast') sectionAbastecimento.classList.remove('hidden');
  if(key === 'rel') sectionRelatorios.classList.remove('hidden');
  sidebar.classList.remove('open');
}

linkAbast?.addEventListener('click', ()=> showSection('abast'));
linkRel?.addEventListener('click', ()=> { showSection('rel'); refreshRelatorios(); });

btnLogout?.addEventListener('click', async ()=> { await signOut(getAuth()); window.location.href = './login.html'; });

btnChangePass?.addEventListener('click', async ()=> {
  const oldp = prompt('Senha atual:');
  if(oldp===null) return;
  const newp = prompt('Nova senha:');
  if(!newp) return;
  try{
    const user = getAuth().currentUser;
    const cred = EmailAuthProvider.credential(user.email, oldp);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, newp);
    alert('Senha alterada com sucesso!');
  }catch(e){ alert('Erro ao alterar senha: '+e.message); }
});

// Auth state
onAuthStateChanged(getAuth(), async (user)=>{
  if(!user){ window.location.href='./login.html'; return; }
  // Load profile
  const profileSnap = await getDoc(doc(getFirestore(), 'users', user.uid));
  if(!profileSnap.exists()){
    alert('Perfil não encontrado. Faça login novamente.');
    await signOut(getAuth());
    window.location.href='./login.html';
    return;
  }
  currentUser = profileSnap.data();
  // Badge + controls
  userBadge.textContent = `${currentUser.nome} · ${currentUser.matricula}`;
  userBadge.classList.add(currentUser.role === 'admin' ? 'gold' : 'green', 'badge');
  document.querySelectorAll('.auth-only').forEach(el => el.classList.remove('hidden'));

  // Load/restore open caixa
  await findOrAttachOpenCaixa();
  renderAbastecimentoUI();
  refreshRelatorios();
});

/* ================== CAIXA ================== */
async function findOrAttachOpenCaixa(){
  const q = query(collection(db,'caixas'), where('matriculaRecebedor','==', currentUser.matricula), where('aberto','==', true));
  const snap = await getDocs(q);
  if(!snap.empty){
    const docx = snap.docs[0];
    currentCaixaId = docx.id;
  }else{
    currentCaixaId = null;
  }
  document.getElementById('caixa-status').textContent = currentCaixaId ? 'ABERTO' : 'FECHADO';
  document.getElementById('btn-open').disabled = !!currentCaixaId;
  document.getElementById('btn-close').disabled = !currentCaixaId;
  document.getElementById('abastecimento-form-wrap').classList.toggle('hidden', !currentCaixaId);
  document.getElementById('sangria-wrap').classList.toggle('hidden', !currentCaixaId);
}

function brDate(d = new Date()){
  return d.toLocaleDateString('pt-BR');
}
function pad(n){ return n.toString().padStart(2,'0'); }
function isoDay(d = new Date()){
  // YYYY-MM-DD for filtering
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
}

document.getElementById('btn-open')?.addEventListener('click', async ()=>{
  try{
    const now = new Date();
    const caixaRef = await addDoc(collection(db,'caixas'), {
      matriculaRecebedor: currentUser.matricula,
      nomeRecebedor: currentUser.nome,
      aberto: true,
      abertoEm: now.toISOString(),
      abertoDia: isoDay(now),
      fechadoEm: null,
      totalAbastecimentos: 0,
      totalPosSangria: 0,
      createdBy: currentUser.uid
    });
    currentCaixaId = caixaRef.id;
    await findOrAttachOpenCaixa();
    alert('Caixa aberto.');
  }catch(e){ alert('Erro ao abrir caixa: '+e.message); }
});

document.getElementById('btn-close')?.addEventListener('click', async ()=>{
  if(!currentCaixaId) return;
  try{
    // compute totals
    const abastRef = collection(db,'caixas', currentCaixaId, 'abastecimentos');
    const abastSnap = await getDocs(abastRef);
    let total = 0;
    abastSnap.forEach(d=> total += (d.data().valor || 0));
    // sangrias autorizadas
    const sangRef = collection(db,'caixas', currentCaixaId, 'sangrias');
    const sangSnap = await getDocs(sangRef);
    let sangAut = 0;
    sangSnap.forEach(d=> { if(d.data().status==='autorizado') sangAut += (d.data().valor||0); });
    const pos = total - sangAut;
    await updateDoc(doc(db,'caixas', currentCaixaId), {
      aberto:false,
      fechadoEm: new Date().toISOString(),
      totalAbastecimentos: total,
      totalPosSangria: pos
    });
    alert(`Caixa fechado. Total: R$ ${total.toFixed(2)} | Pós-sangria: R$ ${pos.toFixed(2)}`);
    currentCaixaId = null;
    await findOrAttachOpenCaixa();
    refreshRelatorios();
  }catch(e){ alert('Erro ao fechar caixa: '+e.message); }
});

/* ================== ABASTECIMENTO ================== */
const validadorSel = document.getElementById('validador');
const qtdBordos = document.getElementById('qtd-bordos');
const valorR = document.getElementById('valor');
const prefixo = document.getElementById('prefixo');
const dataCaixa = document.getElementById('data-caixa');
const matriculaMotorista = document.getElementById('m-motorista');
const matriculaRecebedor = document.getElementById('m-recebedor');

function recalcValor(){
  const q = parseInt(qtdBordos.value || '0', 10);
  valorR.value = (q * 5).toFixed(2);
}
qtdBordos?.addEventListener('input', recalcValor);
document.getElementById('prefixo-suf')?.addEventListener('input', (e)=>{
  const suf = e.target.value.replace(/\D/g,'').slice(0,3);
  e.target.value = suf;
  prefixo.value = `55${suf.padStart(3,'0')}`;
});
function resetAbastForm(){
  validadorSel.value = 'PRODATA';
  qtdBordos.value = '';
  valorR.value = '';
  document.getElementById('prefixo-suf').value='';
  prefixo.value='55';
  dataCaixa.value = new Date().toISOString().slice(0,10);
  matriculaMotorista.value='';
  matriculaRecebedor.value=currentUser?.matricula || '';
}
function initAbastDefaults(){
  dataCaixa.value = new Date().toISOString().slice(0,10);
  matriculaRecebedor.value = currentUser?.matricula || '';
}
initAbastDefaults();

document.getElementById('btn-salvar-abast')?.addEventListener('click', async ()=>{
  if(!currentCaixaId){ alert('Abra um caixa antes de abastecer.'); return; }
  try{
    const abast = {
      validador: validadorSel.value,
      quantidadeBordos: parseInt(qtdBordos.value||'0',10),
      valor: parseFloat(valorR.value||'0'),
      prefixo: prefixo.value,
      dataBR: new Date(dataCaixa.value).toLocaleDateString('pt-BR'),
      dataISO: dataCaixa.value,
      matriculaMotorista: matriculaMotorista.value,
      matriculaRecebedor: matriculaRecebedor.value,
      criadoEm: new Date().toISOString(),
      criadoPor: currentUser.uid
    };
    if(!abast.quantidadeBordos || !abast.prefixo.match(/^55\d{3}$/) || !abast.matriculaMotorista){
      alert('Preencha todos os campos obrigatórios.'); return;
    }
    await addDoc(collection(db,'caixas', currentCaixaId, 'abastecimentos'), abast);
    // Gerar recibo e imprimir
    generateAndPrintReceipt(abast);
    resetAbastForm();
  }catch(e){ alert('Erro ao salvar: '+e.message); }
});

function generateAndPrintReceipt(a){
  const area = document.getElementById('receipt-area');
  area.innerHTML = `
    <div class="printable-receipt">
      <h2>RECIBO DE PAGAMENTO MANUAL</h2>
      <div class="hr"></div>
      <div>Data: ${a.dataBR}</div>
      <div>Tipo de validador: ${a.validador}</div>
      <div>PREFIXO: ${a.prefixo}</div>
      <div>QUANTIDADE BORDOS: ${a.quantidadeBordos}</div>
      <div>VALOR: R$ ${a.valor.toFixed(2)}</div>
      <div>MATRICULA MOTORISTA: ${a.matriculaMotorista}</div>
      <div>MATRICULA RECEBEDOR: ${a.matriculaRecebedor}</div>
      <div class="signature">ASSINATURA RECEBEDOR: _____________________</div>
      <div class="hr"></div>
      <div class="center">Move Buss - Mobilidade Urbana</div>
    </div>
  `;
  window.print();
}

/* ================== SANGRIA ================== */
document.getElementById('btn-solicitar-sangria')?.addEventListener('click', async ()=>{
  if(!currentCaixaId){ alert('Abra um caixa primeiro.'); return; }
  const valor = parseFloat(document.getElementById('sangria-valor').value||'0');
  const motivo = document.getElementById('sangria-motivo').value.trim();
  if(!valor || !motivo){ alert('Informe valor e motivo.'); return; }
  await addDoc(collection(db,'caixas', currentCaixaId, 'sangrias'), {
    valor, motivo, solicitante: currentUser.matricula, status:'pendente',
    criadoEm: new Date().toISOString()
  });
  alert('Sangria solicitada. Aguarde autorização do administrador.');
  document.getElementById('sangria-valor').value='';
  document.getElementById('sangria-motivo').value='';
});

/* ================== RELATÓRIOS ================== */

const filtroData = document.getElementById('filtro-data');
filtroData.value = new Date().toISOString().slice(0,10);
document.getElementById('btn-filtrar')?.addEventListener('click', refreshRelatorios);

async function refreshRelatorios(){
  if(!currentUser) return;
  const listWrap = document.getElementById('relatorios-list');
  listWrap.innerHTML = '<div class="notice">Carregando...</div>';
  const dia = filtroData.value; // YYYY-MM-DD
  // Query caixas do dia
  let q1 = query(collection(db,'caixas'), where('abertoDia','==', dia));
  const allSnap = await getDocs(q1);
  // Agrupar por matrícula (só admins veem todos)
  const groups = {};
  allSnap.forEach(docx=>{
    const c = docx.data();
    if(currentUser.role !== 'admin' && c.matriculaRecebedor !== currentUser.matricula) return;
    if(!groups[c.matriculaRecebedor]) groups[c.matriculaRecebedor] = [];
    groups[c.matriculaRecebedor].push({ id: docx.id, ...c });
  });
  listWrap.innerHTML = '';
  const mats = Object.keys(groups).sort();
  if(mats.length===0){ listWrap.innerHTML = '<div class="notice">Nenhum caixa encontrado para o dia.</div>'; return; }
  for(const mat of mats){
    const holder = document.createElement('div');
    holder.innerHTML = `<h3>Matricula ${mat}</h3>`;
    listWrap.appendChild(holder);
    for(const cx of groups[mat]){
      await renderCaixaAccordion(cx, listWrap);
    }
  }
}

async function renderCaixaAccordion(cx, listWrap){
  const acc = document.createElement('div');
  acc.className = 'accordion';
  const titulo = `Abertura: ${new Date(cx.abertoEm).toLocaleTimeString('pt-BR')} • Fechamento: ${cx.fechadoEm ? new Date(cx.fechadoEm).toLocaleTimeString('pt-BR') : '—'} • Matricula: ${cx.matriculaRecebedor}`;
  acc.innerHTML = `
    <div class="acc-head">
      <div>${titulo}</div>
      <div>Valor recebido: R$ ${(cx.totalAbastecimentos||0).toFixed(2)} | Pós sangria: R$ ${(cx.totalPosSangria||0).toFixed(2)}</div>
    </div>
    <div class="acc-body"></div>
  `;
  listWrap.appendChild(acc);
  acc.querySelector('.acc-head').addEventListener('click', ()=> acc.classList.toggle('open'));

  const body = acc.querySelector('.acc-body');
  body.innerHTML = '<div class="notice">Carregando detalhes...</div>';

  // Load abastecimentos e sangrias
  const abastSnap = await getDocs(collection(db,'caixas', cx.id, 'abastecimentos'));
  const rows = [];
  let total=0;
  abastSnap.forEach(d=>{
    const a = d.data(); a._id = d.id;
    total += (a.valor||0);
    rows.push(a);
  });
  const sangSnap = await getDocs(collection(db,'caixas', cx.id, 'sangrias'));
  const sang = []; let sangTotal=0;
  sangSnap.forEach(d=>{
    const s = d.data(); s._id = d.id;
    if(s.status==='autorizado') sangTotal += (s.valor||0);
    sang.push(s);
  });

  // Render table
  const table = document.createElement('table');
  table.className='table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Data</th><th>Validador</th><th>Prefixo</th><th>Qtd Bordos</th><th>Valor (R$)</th><th>Mot.</th><th>Motorista</th><th>Recebedor</th><th class="${currentUser.role==='admin'?'':'hidden'}">Ações</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');
  rows.sort((a,b)=> a.criadoEm.localeCompare(b.criadoEm)).forEach(a=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${a.dataBR||''}</td>
      <td>${a.validador||''}</td>
      <td>${a.prefixo||''}</td>
      <td>${a.quantidadeBordos||''}</td>
      <td>${(a.valor||0).toFixed(2)}</td>
      <td></td>
      <td>${a.matriculaMotorista||''}</td>
      <td>${a.matriculaRecebedor||''}</td>
      <td class="${currentUser.role==='admin'?'':'hidden'}">
        <button class="btn secondary btn-edit" data-id="${a._id}" data-cid="${cx.id}">Editar</button>
        <button class="btn secondary btn-del" data-id="${a._id}" data-cid="${cx.id}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  body.innerHTML='';
  body.appendChild(table);

  // Sangrias
  const sangBox = document.createElement('div');
  sangBox.className='card';
  sangBox.innerHTML = `<div><strong>Sangrias</strong> — Total autorizado: R$ ${sangTotal.toFixed(2)}</div>`;
  const sangTable = document.createElement('table');
  sangTable.className='table';
  sangTable.innerHTML = `
    <thead><tr><th>Valor</th><th>Motivo</th><th>Status</th><th>Solicitante</th><th class="${currentUser.role==='admin'?'':'hidden'}">Admin</th></tr></thead>
    <tbody></tbody>
  `;
  const stBody = sangTable.querySelector('tbody');
  sang.forEach(s=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>R$ ${(s.valor||0).toFixed(2)}</td>
      <td>${s.motivo||''}</td>
      <td>${s.status}</td>
      <td>${s.solicitante||''}</td>
      <td class="${currentUser.role==='admin'?'':'hidden'}">
        ${s.status==='pendente' ? `
          <button class="btn secondary btn-auth" data-cid="${cx.id}" data-id="${s._id}" data-act="autorizado">Autorizar</button>
          <button class="btn secondary btn-auth" data-cid="${cx.id}" data-id="${s._id}" data-act="negado">Negar</button>` : ''}
      </td>
    `;
    stBody.appendChild(tr);
  });
  body.appendChild(sangBox);
  body.appendChild(sangTable);

  // Footer totals
  const foot = document.createElement('div');
  const pos = total - sangTotal;
  foot.className = 'footer-total';
  foot.innerHTML = `Valor lançado: <strong>&nbsp;R$ ${total.toFixed(2)}</strong>&nbsp;&nbsp;|&nbsp;&nbsp;Valor pós sangria: <strong>R$ ${pos.toFixed(2)}</strong>`;
  body.appendChild(foot);

  // Wire admin actions
  body.querySelectorAll('.btn-del').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const cid = e.target.dataset.cid;
      const id = e.target.dataset.id;
      if(confirm('Excluir abastecimento?')){
        await deleteDoc(doc(db,'caixas', cid, 'abastecimentos', id));
        alert('Excluído.');
        refreshRelatorios();
      }
    });
  });
  body.querySelectorAll('.btn-edit').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const cid = e.target.dataset.cid;
      const id = e.target.dataset.id;
      const ref = doc(db,'caixas', cid, 'abastecimentos', id);
      const snap = await getDoc(ref);
      if(!snap.exists()) return;
      const a = snap.data();
      const novoQtd = parseInt(prompt('Quantidade de bordos:', a.quantidadeBordos)||a.quantidadeBordos,10);
      const novoVal = novoQtd*5;
      const novoPrefixoSuf = prompt('Últimos 3 dígitos do prefixo 55:', a.prefixo.slice(2));
      const novoPrefixo = '55'+ String(novoPrefixoSuf||a.prefixo.slice(2)).padStart(3,'0');
      await updateDoc(ref, { quantidadeBordos: novoQtd, valor: novoVal, prefixo: novoPrefixo });
      alert('Atualizado.');
      refreshRelatorios();
    });
  });
  body.querySelectorAll('.btn-auth').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const {cid, id, act} = e.target.dataset;
      await updateDoc(doc(db,'caixas', cid, 'sangrias', id), { status: act, decididoEm: new Date().toISOString(), decididoPor: currentUser.matricula });
      alert('Atualizado.');
      refreshRelatorios();
    });
  });
}

/* ================== UI Helpers ================== */
function renderAbastecimentoUI(){
  whoLabel.textContent = currentUser ? `${currentUser.nome} · ${currentUser.matricula}` : '';
  initAbastDefaults();
}
