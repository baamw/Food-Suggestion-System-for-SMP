localStorage.removeItem("selectedMeals");

const RICE = {
  white: { name:'ข้าวสวย', calories:160, protein:3, fat:0, carbs:36 },
  sticky:{ name:'ข้าวเหนียว', calories:220, protein:4, fat:1, carbs:45 }
};

let selectedRiceByMeal = {};

function generateAndRenderAll(data){
  const box = document.getElementById('resultBox');
  box.innerHTML = '';

  const tdee = Number(data.tdee)||2000;
  const eatenCalories = Number(data.eatenCalories)||0;
  const remaining = Math.max(0, tdee - eatenCalories);

  const shown = JSON.parse(localStorage.getItem('shownMeals')||'{}');
  const mealsOrder = ['breakfast','lunch','dinner'];
  const startIdx = mealsOrder.indexOf(data.mealType);
  
  mealsOrder.slice(startIdx).forEach(meal=>{
    const list = Array.isArray(data.types)
      ? generateBestFitForMeal(meal, remaining, data.types, tdee, 3, shown[meal]||[])
      : generateMeal(meal, shown[meal]||[]);

    shown[meal] = (shown[meal]||[]).concat(list.map(m=>m.name));

    box.insertAdjacentHTML('beforeend',`
      <div class="meal-section" data-meal="${meal}">
        <h2>${{
                breakfast:'Breakfast(มื้อเช้า)',
                lunch:'Lunch(มื้อกลางวัน)',
                dinner:'Dinner(มื้อเย็น)'
                }[meal]}

          <button class="btn-small regen" data-meal="${meal}">🔄</button>
        </h2>

        <div class="rice-toggle">
          <button class="rice-btn" data-rice="white">🍚 ข้าวสวย</button>
          <button class="rice-btn" data-rice="sticky">🍙 ข้าวเหนียว</button>
        </div>

<div class="ai-chat-box">
  <div class="ai-chat-header">🤖 ค้นหาประเภทเมนู...</div>
  <div class="ai-chat-input-wrap">
    <input type="text" class="ai-chat-input" 
      placeholder="พิมพ์..."
      data-meal="${meal}">
    <button class="ai-chat-btn" data-meal="${meal}">ค้นหา</button>
  </div>
</div>

<div class="ai-result-grid meal-grid"></div>

<div class="meal-grid normal-grid">
  ${list.map(m=>mealCardHTML(m)).join('')}
</div>
      </div>
    `);
  });

  localStorage.setItem('shownMeals',JSON.stringify(shown));

  bindRiceButtons();
  bindRegen();
  attachCardEvents();
  updateMacrosSummary();
  bindAIChat();
}

function bindAIChat(){
  document.querySelectorAll('.ai-chat-btn').forEach(btn=>{
    btn.onclick = ()=>{
      const meal = btn.dataset.meal;
      const section = document.querySelector(`.meal-section[data-meal="${meal}"]`);
      const input = section.querySelector('.ai-chat-input');
      const keyword = input.value.trim().toLowerCase();

      if(!keyword) return;

      const results = meals.filter(m=>{
        return m.meal === meal &&
          (
            m.name.toLowerCase().includes(keyword) ||
            m.type.toLowerCase().includes(keyword) ||
            (keyword.includes('โปรตีน') && m.protein >= 20) ||
            (keyword.includes('คีโต') && m.carbs < 20) ||
            (keyword.includes('คลีน') && m.fat <= 12)
          );
      });

      const resultBox = section.querySelector('.ai-result-grid');

      if(results.length === 0){
        resultBox.innerHTML = `
          <div class="no-ai-result">
            ❌ ไม่พบเมนูที่ตรงกับ "${keyword}"
          </div>`;
      }else{
        resultBox.innerHTML = results
          .slice(0,6)
          .map(m=>mealCardHTML(m))
          .join('');
      }

      attachCardEvents();
      updateMacrosSummary();
    };
  });
}

function generateMeal(meal, shown = [], maxItems = 3){
  const pool = meals.filter(m => m.meal === meal);
  let available = pool.filter(m => !shown.includes(m.name));
  if (available.length < maxItems) available = [...pool];
  shuffleArray(available);
  return available.slice(0, maxItems);
}

function generateBestFitForMeal(mealName, remainingCalories, types=[], tdee=0, maxItems=3, shownMeals=[]){
  let pool = meals.filter(m=>m.meal===mealName && (!types.length || types.includes(m.type)));
  if(!pool.length) return [];

  let remain = pool.filter(m=>!shownMeals.includes(m.name));
  if(remain.length < maxItems) remain = pool.slice();

  remain = remain.map(m=>({...m, computedScore: computeScoreForUser(m,tdee,remainingCalories)}));
  remain.sort((a,b)=>
    Math.abs(a.calories-remainingCalories)-Math.abs(b.calories-remainingCalories)
    || b.computedScore-a.computedScore
  );
  return balanceTypes(remain).slice(0,maxItems);
}

function balanceTypes(list){
  const g={};
  list.forEach(m=>(g[m.type]=g[m.type]||[]).push(m));
  Object.values(g).forEach(shuffleArray);

  const r=[];
  while(r.length<3){
    for(const a of Object.values(g)){
      if(a.length) r.push(a.shift());
      if(r.length===3) break;
    }
    if(!Object.values(g).some(x=>x.length)) break;
  }
  return r;
}

function computeScoreForUser(m, tdee = 2000, remaining = 0){
  let score = 0;
  if(m.calories <= remaining){
    score += 3;
  } else if(m.calories <= remaining * 1.1){
    score += 1; 
  } else {
    score -= 3; 
  }

  const proteinCal = m.protein * 4;
  const fatCal     = m.fat * 9;
  const carbCal    = m.carbs * 4;
  const totalCal   = proteinCal + fatCal + carbCal || 1;

  const proteinRatio = proteinCal / totalCal;
  const fatRatio     = fatCal / totalCal;
  const carbRatio    = carbCal / totalCal;

  if(proteinRatio >= 0.25) score += 2;
  if(fatRatio <= 0.35) score += 1;
  if(carbRatio <= 0.55) score += 1;

  if(m.protein >= 25) score += 1;
  if(m.fat > 20) score -= 1;

  return score;
}

function mealCardHTML(m){
  const score=m.computedScore||0;
  let label;
if(score >= 6){
  label = '🌟 เหมาะสมมาก';
}else if(score >= 3){
  label = '🙂 ค่อนข้างเหมาะสม';
}else if(score >= 0){
  label = '⚖️ พอเหมาะ';
}else{
  label = '❌ ไม่แนะนำ';
}
  return `
  <div class="meal-card"
    data-meal="${m.meal}"
    data-name="${escapeHtml(m.name)}"
    data-cal="${m.calories}"
    data-pro="${m.protein}"
    data-fat="${m.fat}"
    data-carb="${m.carbs}">
    <img src="${m.image||'images/placeholder.jpg'}">
    <div class="content">
      <b>${escapeHtml(m.name)}</b>
      <p>🔥 ${m.calories} kcal</p>
      <small>${label}</small><br>
      <button class="select-btn">เลือกเมนู</button>
    </div>
  </div>`;
}

function attachCardEvents(){
  document.querySelectorAll('.select-btn').forEach(btn=>{
    btn.onclick = onSelectBtnClick;
  });
}

function onSelectBtnClick(e){
  const btn = e.currentTarget;
  const card = btn.closest('.meal-card');
  const meal = card.dataset.meal;
  const name = card.dataset.name;

  let sel = JSON.parse(localStorage.getItem('selectedMeals')||'[]');
  const exist = sel.find(s=>s.meal===meal && s.name===name);

  if(exist){
    sel = sel.filter(s=>!(s.meal===meal && s.name===name));
    btn.classList.remove('selected');
    btn.textContent='เลือกเมนู';
  }else{
    sel = sel.filter(s=>s.meal!==meal);
    sel.push({
      meal,name,
      calories:+card.dataset.cal,
      protein:+card.dataset.pro,
      fat:+card.dataset.fat,
      carbs:+card.dataset.carb
    });
    document.querySelectorAll(`.meal-card[data-meal="${meal}"] .select-btn`)
      .forEach(b=>{b.classList.remove('selected');b.textContent='เลือกเมนู';});
    btn.classList.add('selected');
    btn.textContent='เลือกแล้ว ✓';
  }

  localStorage.setItem('selectedMeals',JSON.stringify(sel));
  updateMacrosSummary();
}

function bindRiceButtons(){
  document.querySelectorAll('.rice-btn').forEach(btn=>{
    btn.onclick = ()=>{
      const meal = btn.closest('.meal-section').dataset.meal;
      selectedRiceByMeal[meal] =
        selectedRiceByMeal[meal]===btn.dataset.rice ? null : btn.dataset.rice;

      btn.closest('.meal-section')
        .querySelectorAll('.rice-btn')
        .forEach(b=>b.classList.remove('active'));

      if(selectedRiceByMeal[meal]) btn.classList.add('active');
      updateMacrosSummary();
    };
  });
}

function bindRegen(){
  document.querySelectorAll('.regen').forEach(btn=>{
    btn.onclick=()=>{
      const meal=btn.dataset.meal;
      const data=JSON.parse(localStorage.getItem('mealInput'));
      regenerateSingleMeal(meal,data);
    };
  });
}

function regenerateSingleMeal(meal,data){
  const sec=document.querySelector(`.meal-section[data-meal="${meal}"]`);
  if(!sec) return;

  const shown=JSON.parse(localStorage.getItem('shownMeals')||'{}');
  shown[meal]=[];
  localStorage.setItem('shownMeals',JSON.stringify(shown));

  const tdee=Number(data.tdee)||2000;
  const selected = JSON.parse(localStorage.getItem('selectedMeals')||'[]');

  const riceCal = Object.values(selectedRiceByMeal)
    .filter(Boolean)
    .reduce((s,k)=>s+RICE[k].calories,0);

  const used = selected
    .filter(m => m.meal !== meal)
    .reduce((s,m)=>s+m.calories,0) + riceCal;

  const remain = Math.max(0, tdee - used);

  const list = Array.isArray(data.types)
    ? generateBestFitForMeal(meal,remain,data.types,tdee,3,[])
    : generateMeal(meal,[]);

  sec.querySelector('.normal-grid').innerHTML =
    list.map(m=>mealCardHTML(m)).join('');

  attachCardEvents();
  updateMacrosSummary();
}

function updateMacrosSummary(){
  const input=JSON.parse(localStorage.getItem('mealInput')||'{}');
  const selected=JSON.parse(localStorage.getItem('selectedMeals')||'[]');
  const tdee=Number(input.tdee)||2000;

  let p=0,f=0,c=0,cal=0;

  if(Number(input.eatenCalories)>0){
    cal+=Number(input.eatenCalories);
    p+=Math.round(cal*0.2/4);
    f+=Math.round(cal*0.3/9);
    c+=Math.round(cal*0.5/4);
  }

  selected.forEach(s=>{
    p+=s.protein; f+=s.fat; c+=s.carbs; cal+=s.calories;
  });

  Object.values(selectedRiceByMeal).forEach(k=>{
    if(k){
      const r=RICE[k];
      p+=r.protein; f+=r.fat; c+=r.carbs; cal+=r.calories;
    }
  });

  document.getElementById('proteinVal').textContent=`${p} g`;
  document.getElementById('fatVal').textContent=`${f} g`;
  document.getElementById('carbVal').textContent=`${c} g`;
  document.getElementById('calVal').textContent=`${cal} kcal`;

  document.getElementById('proteinBar').style.width=Math.min(100,p*4/tdee*100)+'%';
  document.getElementById('fatBar').style.width=Math.min(100,f*9/tdee*100)+'%';
  document.getElementById('carbBar').style.width=Math.min(100,c*4/tdee*100)+'%';
  document.getElementById('calBar').style.width=Math.min(100,cal/tdee*100)+'%';
  updateRemainingCalories();
}

let popupTimeout = null;

function showPopup(message, type = 'over') {
  const popup = document.getElementById('overCalPopup');
  popup.textContent = message;
  popup.className = `popup show ${type}`;

  clearTimeout(popupTimeout);
  popupTimeout = setTimeout(() => {
    popup.classList.remove('show');
  }, 3000);
}

function updateRemainingCalories(){   
  const input = JSON.parse(localStorage.getItem('mealInput') || '{}');
  const tdee = Number(input.tdee) || 2000;
  const eaten = Number(input.eatenCalories) || 0;

  const selected = JSON.parse(localStorage.getItem('selectedMeals') || '[]');

  let used = eaten;

  selected.forEach(m => used += m.calories);

  Object.values(selectedRiceByMeal).forEach(k => {
    if (k) used += RICE[k].calories;
  });

  const remain = tdee - used;

  const btn = document.getElementById('remainBtn');
  const val = document.getElementById('remainVal');

  const percentRemain = remain / tdee;

  if (remain < 0) {
    btn.classList.add('over');
    btn.classList.remove('warning');
    btn.innerHTML = '🍩💥 กินเกินแคลอรี่เป้าหมายแล้วนะ!!';
    showPopup('💥 กินเกินแคลอรี่เป้าหมายแล้วนะ!', 'over');
    return;
  }

  if (percentRemain <= 0.1) {
    btn.classList.add('warning');
    btn.classList.remove('over');
    btn.innerHTML = `⚠️ เหลืออีก <span id="remainVal">${remain}</span> kcal`;
    showPopup('⚠️ ใกล้จะเกินแคลแล้ววว ระวังน้า~', 'warning');
  } else {
    btn.classList.remove('warning','over');
    btn.innerHTML = ` 🍽️ กินได้อีก... <span id="remainVal">${remain}</span> kcal`;
  }

  const hue = Math.max(0, Math.min(160, percentRemain * 160));
  btn.style.background = `
    linear-gradient(135deg,
      hsl(${hue},90%,75%),
      hsl(${hue - 30},95%,85%)
    )
  `;
}

  localStorage.setItem('isOverCalories', isOver);

  if (isOver) {
    btn.classList.add('over');
    btn.style.background = '#ff0004ff';
  } else {
    btn.classList.remove('over');

    const percent = remain / tdee;
    const hue = Math.max(0, Math.min(200, percent * 200));

    btn.style.background =
      `linear-gradient(135deg,
        hsl(${hue},90%,70%),
        hsl(${Math.max(hue - 40, 0)},90%,75%)
      )`;
  }

function shuffleArray(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}}
function capitalize(s){return s?s[0].toUpperCase()+s.slice(1):'';}
function escapeHtml(str){return(str+'').replace(/[&<"']/g,m=>({'&':'&amp;','<':'&lt;','"':'&quot;',"'":'&#039;'}[m]));}

window.generateAndRenderAll=generateAndRenderAll;
window.generateBestFitForMeal=generateBestFitForMeal;
window.updateMacrosSummary=updateMacrosSummary;