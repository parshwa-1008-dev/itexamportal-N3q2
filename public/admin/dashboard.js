"use strict";

const API = "/api/admin-control";
let papers = [];
let materials = [];
let practice = [];

const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[c]);

function notice(message, type="success") {
 const box=$("notice");
 box.textContent=message;
 box.className="show "+type;
 window.scrollTo({top:0,behavior:"smooth"});
}

async function api(path, options={}) {
 const response=await fetch(API+path,{
  credentials:"same-origin",
  ...options,
  headers:{"Content-Type":"application/json",...(options.headers||{})}
 });
 const data=await response.json().catch(()=>({}));
 if(response.status===401) {
  window.location.href="/admin/login.html";
  throw new Error("Admin session expired. Please sign in again.");
 }
 if(!response.ok) throw new Error(data.error||"Request failed ("+response.status+")");
 return data;
}

function formData(form) {
 return Object.fromEntries(new FormData(form).entries());
}

function publishButton(type,id,published) {
 return `<button class="small secondary" data-action="publish" data-type="${type}" data-id="${id}" data-value="${published?0:1}">${published?"Unpublish":"Publish"}</button>`;
}

async function loadMaterials() {
 const data=await api("/materials");
 materials=data.materials||[];
 $("materialCount").textContent=materials.length;
 $("materialList").innerHTML=materials.length?materials.map(m=>`
 <div class="item">
  <div><strong>${escapeHTML(m.title)}</strong><p>${escapeHTML(m.chapter)} · ${escapeHTML(m.material_type)} · ${m.is_published?"Published":"Draft"}</p></div>
  <div class="item-actions">${publishButton("materials",m.id,m.is_published)}<button class="small danger" data-action="delete" data-type="materials" data-id="${m.id}">Delete</button></div>
 </div>`).join(""):"<p>No materials have been added yet.</p>";
}

async function loadPractice() {
 const data=await api("/practice");
 practice=data.questions||[];
 $("practiceCount").textContent=practice.length;
 $("practiceList").innerHTML=practice.length?practice.map(q=>`
 <div class="item">
  <div><strong>${escapeHTML(q.question)}</strong><p>${escapeHTML(q.chapter)} · Correct answer: ${escapeHTML(q.correct_option)} · ${q.is_published?"Published":"Draft"}</p></div>
  <div class="item-actions">${publishButton("practice",q.id,q.is_published)}<button class="small danger" data-action="delete" data-type="practice" data-id="${q.id}">Delete</button></div>
 </div>`).join(""):"<p>No practice questions have been added yet.</p>";
}

async function loadExams() {
 const data=await api("/exams");
 papers=data.papers||[];
 $("examCount").textContent=papers.length;
 $("publishedCount").textContent=papers.filter(p=>p.is_published).length;
 $("selectedPaper").innerHTML='<option value="">Select a paper</option>'+papers.map(p=>`<option value="${p.id}">${escapeHTML(p.title)} (#${p.id}) — ${p.is_published?"Published":"Draft"}</option>`).join("");
 $("examList").innerHTML=papers.length?papers.map(p=>{
  const mcq=(data.questions||[]).filter(q=>q.paper_id===p.id);
  const written=(data.written||[]).filter(q=>q.paper_id===p.id);
  return `<div class="item"><div><strong>${escapeHTML(p.title)}</strong><p>${escapeHTML(p.exam_date)} · ${p.total_marks} marks · ${p.duration_minutes} minutes</p><p>${mcq.length} MCQs · ${written.length} written questions · ${p.is_published?"Published":"Draft"}</p></div><div>${publishButton("exams",p.id,p.is_published)}</div></div>`;
 }).join(""):"<p>No exam papers have been created.</p>";
}

async function loadAudit() {
 const data=await api("/audit");
 const logs=data.logs||[];
 $("auditList").innerHTML=logs.length?logs.map(log=>`
 <div class="item"><div><strong>${escapeHTML(log.action)}</strong><p>${escapeHTML(log.detail||"")} · ${escapeHTML(log.created_at)}</p></div></div>
 `).join(""):"<p>No audit entries available.</p>";
}

async function refreshAll() {
 await Promise.all([loadMaterials(),loadPractice(),loadExams()]);
}

document.addEventListener("DOMContentLoaded",async()=>{
 try {
  const session=await api("/me");
  $("adminEmail").textContent=session.admin.email||"Administrator";
  await refreshAll();
 } catch(error) { notice(error.message,"error"); }
});

document.querySelectorAll(".nav").forEach(button=>{
 button.addEventListener("click",async()=>{
  document.querySelectorAll(".nav").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t=>t.classList.add("hidden"));
  button.classList.add("active");
  $(button.dataset.tab).classList.remove("hidden");
  try { if(button.dataset.tab==="audit") await loadAudit(); } catch(e){notice(e.message,"error");}
 });
});

$("materialForm").addEventListener("submit",async e=>{
 e.preventDefault();
 try {
  const d=formData(e.currentTarget);
  d.publish=e.currentTarget.elements.publish.checked;
  await api("/materials",{method:"POST",body:JSON.stringify(d)});
  e.currentTarget.reset();await loadMaterials();notice("Study material saved.");
 } catch(error){notice(error.message,"error");}
});

$("practiceForm").addEventListener("submit",async e=>{
 e.preventDefault();
 try {
  const d=formData(e.currentTarget);
  d.options={A:d.A,B:d.B,C:d.C,D:d.D};
  d.publish=e.currentTarget.elements.publish.checked;
  delete d.A;delete d.B;delete d.C;delete d.D;
  await api("/practice",{method:"POST",body:JSON.stringify(d)});
  e.currentTarget.reset();await loadPractice();notice("Practice question saved.");
 } catch(error){notice(error.message,"error");}
});

$("examForm").addEventListener("submit",async e=>{
 e.preventDefault();
 try {
  const d=formData(e.currentTarget);
  await api("/exams",{method:"POST",body:JSON.stringify(d)});
  e.currentTarget.reset();await loadExams();notice("Sunday exam paper created. Add questions before publishing.");
 } catch(error){notice(error.message,"error");}
});

$("examMcqForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const id=$("selectedPaper").value;
 if(!id){notice("Select an exam paper first.","error");return;}
 try {
  const d=formData(e.currentTarget);
  d.options={A:d.A,B:d.B,C:d.C,D:d.D};
  delete d.A;delete d.B;delete d.C;delete d.D;
  await api("/exams/"+encodeURIComponent(id)+"/mcq",{method:"POST",body:JSON.stringify(d)});
  e.currentTarget.reset();await loadExams();notice("Exam MCQ added.");
 } catch(error){notice(error.message,"error");}
});

$("writtenForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const id=$("selectedPaper").value;
 if(!id){notice("Select an exam paper first.","error");return;}
 try {
  const d=formData(e.currentTarget);
  await api("/exams/"+encodeURIComponent(id)+"/written",{method:"POST",body:JSON.stringify(d)});
  e.currentTarget.reset();await loadExams();notice("Written question and rubric added.");
 } catch(error){notice(error.message,"error");}
});

document.addEventListener("click",async e=>{
 const button=e.target.closest("[data-action]");
 if(!button)return;
 const {action,type,id,value}=button.dataset;
 try {
  if(action==="publish"){
   const path=type==="exams"?`/exams/${id}/publish`:`/${type}/${id}/publish`;
   await api(path,{method:"POST",body:JSON.stringify({publish:value==="1"})});
   await refreshAll();notice("Publication status updated.");
  }
  if(action==="delete"){
   if(!confirm("Delete this item? This cannot be undone."))return;
   await api(`/${type}/${id}`,{method:"DELETE"});
   await refreshAll();notice("Item deleted.");
  }
 } catch(error){notice(error.message,"error");}
});

$("logoutBtn").addEventListener("click",async()=>{
 try {
  await api("/logout",{method:"POST",body:"{}"});
  window.location.href="/admin/login.html";
 } catch(error){notice(error.message,"error");}
});
