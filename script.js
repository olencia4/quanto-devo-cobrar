/* Quanto Devo Cobrar? | versão premium */
(() => {
  "use strict";
  const SUPABASE_URL = "https://bndstqeslspkzmfinmia.supabase.co";
  const SUPABASE_KEY = "sb_publishable_NPjGuXeBFH0JwMF6lP--pg_HfEkVpaX";
  const STORAGE_KEY = "quantoDevoCobrar_history_v3";
const FORM_KEY = "quantoDevoCobrar_form_v3";

const ANONYMOUS_STORAGE_KEY = "quantoDevoCobrar_history_anonymous_v1";
const USER_STORAGE_PREFIX = "quantoDevoCobrar_history_user_";
const PENDING_DELETE_PREFIX = "quantoDevoCobrar_pending_delete_";
const PENDING_CLEAR_PREFIX = "quantoDevoCobrar_pending_clear_";
  const $ = (id) => document.getElementById(id);
  const fields = {
    form: $("priceForm"), name: $("productName"), mode: $("calculationMode"), currency: $("currency"),
    cost: $("purchaseCost"), rate: $("exchangeRate"), quantity: $("quantity"), expenses: $("expenses"),
    margin: $("margin"), production: $("productionFields"), resale: $("resaleFields"),
    ingredients: $("ingredientsList"), labor: $("laborCost"), productionExpenses: $("productionExpenses")
  };
  const currencyNames = {MZN:"Metical",ZAR:"Rand",USD:"Dólar",EUR:"Euro",GBP:"Libra",CNY:"Yuan"};
 let history = readJSON(ANONYMOUS_STORAGE_KEY, null);

if (!Array.isArray(history)) {
  history = readJSON(STORAGE_KEY, []);
  saveJSON(ANONYMOUS_STORAGE_KEY, history);
}

let editingHistoryId = null;
let latestResult = null;
let supabaseClient = null;
let currentUserId = null;

  function readJSON(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } }
  function saveJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { console.warn("Não foi possível guardar os dados localmente.", error); } }
  function persistHistory() {
  saveJSON(STORAGE_KEY, history);

  if (currentUserId) {
    saveJSON(USER_STORAGE_PREFIX + currentUserId, history);
  } else {
    saveJSON(ANONYMOUS_STORAGE_KEY, history);
  }
}

function toSupabaseRow(item, userId) {
  console.log("MODO ENVIADO AO SUPABASE:", item.mode);
  return {
    user_id: userId,
    calculation_id: String(item.id),
    product_name: item.name,
    calculation_mode: ({
  resale: "revenda",
  production: "fabrico",
  service: "servico"
})[item.mode] || item.mode,
    input_data: {
      quantity: item.quantity,
      margin: item.margin,
      sourceCurrency: item.sourceCurrency,
      exchangeRate: item.exchangeRate,
      originalCost: item.originalCost,
      expenses: item.expenses,
      labor: item.labor,
      directExpenses: item.directExpenses,
      ingredients: item.ingredients
    },
    result_data: item,
    created_at: item.date
  };
}

async function saveCalculationToSupabase(item) {
  if (!supabaseClient || !currentUserId) return;

  try {
    const { error } = await supabaseClient
      .from("calculation_history")
      .upsert(
        toSupabaseRow(item, currentUserId),
        { onConflict: "user_id,calculation_id" }
      );

    if (error) throw error;

  } catch (error) {
    console.error("Não foi possível sincronizar o cálculo:", error);
  }
}

async function syncHistoryForUser(user) {
  if (!supabaseClient || !user?.id) return;

  const userId = user.id;
  const userStorageKey = USER_STORAGE_PREFIX + userId;
  const pendingDeleteKey = PENDING_DELETE_PREFIX + userId;
  const pendingClearKey = PENDING_CLEAR_PREFIX + userId;

  try {
    // Carregar primeiro a cópia local desta conta.
    const cachedHistory = readJSON(userStorageKey, []);
    history = Array.isArray(cachedHistory) ? cachedHistory : [];

    saveJSON(STORAGE_KEY, history);
    renderHistory();

    // Processar uma eliminação total que tenha ficado pendente.
    if (readJSON(pendingClearKey, false)) {
      const { error } = await supabaseClient
        .from("calculation_history")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;

      localStorage.removeItem(pendingClearKey);
      localStorage.removeItem(pendingDeleteKey);
    } else {
      // Processar eliminações individuais pendentes.
      const pendingIds = readJSON(pendingDeleteKey, []);

      if (Array.isArray(pendingIds) && pendingIds.length) {
        const { error } = await supabaseClient
          .from("calculation_history")
          .delete()
          .eq("user_id", userId)
          .in("calculation_id", pendingIds);

        if (error) throw error;

        localStorage.removeItem(pendingDeleteKey);
      }
    }

    // Transferir os cálculos feitos antes de iniciar sessão.
    const anonymousHistory = readJSON(ANONYMOUS_STORAGE_KEY, []);

    if (Array.isArray(anonymousHistory) && anonymousHistory.length) {
      const rows = anonymousHistory.map(item => toSupabaseRow(item, userId));

      const { error } = await supabaseClient
        .from("calculation_history")
        .upsert(rows, {
          onConflict: "user_id,calculation_id"
        });

      if (error) throw error;
    }

    // Recuperar o histórico guardado na conta.
    const { data, error } = await supabaseClient
      .from("calculation_history")
      .select("calculation_id, product_name, calculation_mode, result_data, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    history = (data || []).map(row => {
      const result = row.result_data || {};

      return {
        ...result,
        id: row.calculation_id || result.id,
        name: result.name || row.product_name,
        mode: result.mode || row.calculation_mode,
        date: result.date || row.created_at
      };
    });

    // Guardar a cópia local depois de confirmar a leitura remota.
    saveJSON(userStorageKey, history);
    saveJSON(STORAGE_KEY, history);

    // Só limpar o histórico anónimo depois de a sincronização terminar.
    if (Array.isArray(anonymousHistory) && anonymousHistory.length) {
      saveJSON(ANONYMOUS_STORAGE_KEY, []);
    }

    renderHistory();

    console.log("Histórico sincronizado com sucesso.");

  } catch (error) {
    console.error("Erro ao sincronizar o histórico:", error);
    // Mantém os dados locais se a sincronização falhar.
  }
}

async function handleAuthSession(session) {
  const user = session?.user || null;
  const nextUserId = user?.id || null;

  if (nextUserId === currentUserId) return;

  currentUserId = nextUserId;

  if (user) {
    await syncHistoryForUser(user);
  } else {
    history = readJSON(ANONYMOUS_STORAGE_KEY, []);
    if (!Array.isArray(history)) history = [];

    saveJSON(STORAGE_KEY, history);
    renderHistory();
  }
}
  function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  function money(value) { return new Intl.NumberFormat("pt-MZ", {minimumFractionDigits:2, maximumFractionDigits:2}).format(number(value)) + " MT"; }
  function showError(message) { const box = $("formError"); box.textContent = message; box.hidden = !message; if (message) box.scrollIntoView({behavior:"smooth",block:"nearest"}); }
  function hideError() { showError(""); }
 function roundUpToWhole(value) {
  return Math.ceil(value - 1e-10);
}
  function getModeText(mode) {
    if (mode === "production") return {title:"Dados do fabrico",intro:"Usa este modo quando transformas ingredientes ou matérias-primas num produto. Regista apenas a quantidade efectivamente utilizada, a mão de obra e os custos de produção.",materials:"Ingredientes e materiais utilizados",description:"Indica o custo da quantidade de cada ingrediente ou material usada neste lote.",labor:"Mão de obra da produção (MT)",extra:"Energia, gás e outros custos de produção (MT)",expenses:"Outras despesas do lote (MT)"};
    if (mode === "service") return {title:"Dados do serviço",intro:"Usa este modo para calcular o preço de um trabalho ou serviço. Inclui materiais consumidos, mão de obra, deslocação e outras despesas. Para ferramentas reutilizáveis, considera apenas o custo proporcional ao serviço.",materials:"Materiais utilizados no serviço",description:"Adiciona os materiais consumidos neste trabalho. Se não utilizares materiais, podes deixar esta secção vazia.",labor:"Mão de obra do serviço (MT)",extra:"Deslocação e outros custos directos (MT)",expenses:"Despesas adicionais do serviço (MT)"};
    return {title:"Dados do produto",intro:"Usa este modo quando compras produtos prontos e depois os revendes. Introduz o custo da compra, a moeda, a taxa de câmbio e as despesas adicionais.",materials:"Ingredientes e materiais utilizados",description:"Regista o custo da quantidade de cada ingrediente ou material utilizado nesta produção.",labor:"Custo da mão de obra (MT)",extra:"Gás, electricidade e outros custos (MT)",expenses:"Despesas adicionais (MT)"};
  }
  function updateMode() {
    const mode = fields.mode.value;
    const config = getModeText(mode);
    document.querySelectorAll(".mode-card").forEach(card => {
      const active = card.dataset.mode === mode;
      card.classList.toggle("is-active", active);
      card.setAttribute("aria-pressed", String(active));
    });
    $("formTitle").textContent = config.title;
    $("modeIntroduction").textContent = config.intro;
    $("materialsHeading").textContent = config.materials;
    $("materialsDescription").textContent = config.description;
    $("laborCostLabel").textContent = config.labor;
    $("productionExpensesLabel").textContent = config.extra;
    $("expensesLabel").textContent = config.expenses;
    fields.production.hidden = mode === "resale";
    fields.resale.hidden = mode !== "resale";
    fields.cost.required = mode === "resale";
    fields.rate.required = mode === "resale" && fields.currency.value !== "MZN";
    updateCurrency();
    saveFormData();
  }
  function updateCurrency() {
    const isMZN = fields.currency.value === "MZN";
    fields.rate.disabled = isMZN;
    fields.rate.value = isMZN ? "1" : (number(fields.rate.value) > 0 ? fields.rate.value : "");
   fields.rate.required = fields.mode.value === "resale" && !isMZN;
    $("exchangeRateField").style.opacity = isMZN ? ".68" : "1";
    $("purchaseCostHelp").textContent = `Introduz o valor em ${currencyNames[fields.currency.value]} (${fields.currency.value}).`;
    $("exchangeRateHelp").textContent = `Quantos meticais pagaste por 1 ${fields.currency.value}?`;
    saveFormData();
  }
  function addIngredientRow(data = {}) {
    const row = document.createElement("div");
    row.className = "ingredient-row";
    row.innerHTML = `<div class="field"><label>Nome do ingrediente/material</label><input type="text" class="ingredient-name" maxlength="80" placeholder="Ex.: Farinha"></div><div class="field"><label>Custo utilizado</label><input type="number" class="ingredient-cost" min="0" step="0.01" placeholder="Ex.: 150"></div><div class="field"><label>Moeda</label><select class="ingredient-currency"><option value="MZN">MZN</option><option value="ZAR">ZAR</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="CNY">CNY</option></select></div><div class="field"><label>Taxa para MZN</label><input type="number" class="ingredient-rate" min="0.000001" step="any" value="1"><small>MT por 1 unidade da moeda.</small><button type="button" class="remove-material">Remover</button></div>`;
    const name = row.querySelector(".ingredient-name");
    const cost = row.querySelector(".ingredient-cost");
    const currency = row.querySelector(".ingredient-currency");
    const rate = row.querySelector(".ingredient-rate");
    name.value = data.name || ""; cost.value = data.cost ?? ""; currency.value = data.currency || "MZN"; rate.value = data.rate ?? "1";
    rate.disabled = currency.value === "MZN";
    currency.addEventListener("change", () => { rate.disabled = currency.value === "MZN"; if (rate.disabled) rate.value = "1"; else if (number(rate.value) <= 0) rate.value = ""; saveFormData(); });
    row.querySelector(".remove-material").addEventListener("click", () => { row.remove(); saveFormData(); });
    row.querySelectorAll("input,select").forEach(el => el.addEventListener("input", saveFormData));
    fields.ingredients.appendChild(row);
    return row;
  }
  function collectIngredients() {
    return [...fields.ingredients.querySelectorAll(".ingredient-row")].map(row => ({
      name:row.querySelector(".ingredient-name").value.trim(), cost:number(row.querySelector(".ingredient-cost").value),
      currency:row.querySelector(".ingredient-currency").value, rate:number(row.querySelector(".ingredient-rate").value)
    })).filter(item => item.name || item.cost > 0);
  }
  function saveFormData() {
    if (!fields.form) return;
    const data = {name:fields.name.value,mode:fields.mode.value,currency:fields.currency.value,cost:fields.cost.value,rate:fields.rate.value,quantity:fields.quantity.value,expenses:fields.expenses.value,margin:fields.margin.value,labor:fields.labor.value,productionExpenses:fields.productionExpenses.value,ingredients:collectIngredients()};
    saveJSON(FORM_KEY,data);
  }
  function loadFormData() {
    const data = readJSON(FORM_KEY,null); if (!data) return;
    fields.name.value=data.name||""; fields.mode.value=data.mode||"resale"; fields.currency.value=data.currency||"MZN"; fields.cost.value=data.cost||""; fields.rate.value=data.rate||"1"; fields.quantity.value=data.quantity||""; fields.expenses.value=data.expenses??"0"; fields.margin.value=data.margin||"40"; fields.labor.value=data.labor??"0"; fields.productionExpenses.value=data.productionExpenses??"0";
    fields.ingredients.innerHTML=""; (data.ingredients?.length?data.ingredients:[{}]).forEach(item=>addIngredientRow(item));
    updateMode();
  }
  function validateAndCalculate() {
    const mode=fields.mode.value, quantity=number(fields.quantity.value), margin=number(fields.margin.value), expenses=number(fields.expenses.value);
    if (!fields.name.value.trim()) throw new Error("Introduz o nome do produto ou serviço.");
    if (!Number.isInteger(quantity)||quantity<1) throw new Error("A quantidade deve ser um número inteiro igual ou superior a 1.");
    if (margin<0||margin>=100) throw new Error("A margem deve estar entre 0% e 99,99%.");
    if (expenses<0) throw new Error("As despesas adicionais não podem ser negativas.");
    let convertedCost=0, originalCost=0, sourceCurrency="MZN", exchangeRate=1, ingredientDetails=[];
    let labor=0, directExpenses=0;
    if (mode === "resale") {
      originalCost=number(fields.cost.value); sourceCurrency=fields.currency.value; exchangeRate=sourceCurrency==="MZN"?1:number(fields.rate.value);
      if (originalCost<=0) throw new Error("Introduz um custo de compra superior a zero.");
      if (exchangeRate<=0) throw new Error("Introduz uma taxa de câmbio válida para converter a compra em meticais.");
      convertedCost=originalCost*exchangeRate;
    } else {
      const items=collectIngredients();
      if (items.some(item=>item.cost<0)) throw new Error("Os custos dos materiais não podem ser negativos.");
      for (const item of items) {
        if (item.cost>0 && item.currency!=="MZN" && item.rate<=0) throw new Error(`Indica uma taxa de câmbio válida para ${item.name||"um material"}.`);
        const rate=item.currency==="MZN"?1:item.rate;
        const converted=item.cost*rate;
        convertedCost+=converted; originalCost+=item.cost;
        ingredientDetails.push({...item,converted,rate});
      }
      labor=number(fields.labor.value); directExpenses=number(fields.productionExpenses.value);
      if (labor<0||directExpenses<0) throw new Error("Mão de obra e custos directos não podem ser negativos.");
      if (mode==="production" && convertedCost<=0) throw new Error("Adiciona pelo menos um ingrediente ou material com custo superior a zero.");
      if (mode==="service" && convertedCost+labor+directExpenses+expenses<=0) throw new Error("Introduz pelo menos um custo de material, mão de obra ou despesa para este serviço.");
    }
    const totalCosts=convertedCost+labor+directExpenses+expenses;
    if (totalCosts<=0) throw new Error("O custo total deve ser superior a zero.");
    const unitCost=totalCosts/quantity;
    const exactPrice=unitCost/(1-margin/100);
    const sellingPrice = roundUpToWhole(exactPrice);
    const unitProfit=sellingPrice-unitCost;
    const totalRevenue=sellingPrice*quantity;
    const totalProfit=totalRevenue-totalCosts;
    const actualMargin=sellingPrice>0?(unitProfit/sellingPrice)*100:0;
    return {id:editingHistoryId||`${Date.now()}-${Math.random().toString(16).slice(2)}`,date:new Date().toISOString(),name:fields.name.value.trim(),mode,quantity,margin,sourceCurrency,exchangeRate,originalCost,convertedCost,labor,directExpenses,expenses,totalCosts,unitCost,exactPrice,sellingPrice,unitProfit,totalRevenue,totalProfit,actualMargin,ingredients:ingredientDetails};
  }
  function renderResult(result) {
    latestResult=result; $("emptyResults").hidden=true; $("resultContent").hidden=false;
    $("sellingPrice").textContent=money(result.sellingPrice); $("priceExplanation").textContent=`Preço calculado com uma margem pretendida de ${result.margin.toFixed(2).replace(".",",")}%`;
    $("actualMargin").textContent=`${result.actualMargin.toFixed(2).replace(".",",")}%`;
    $("unitCost").textContent=money(result.unitCost); $("unitProfit").textContent=money(result.unitProfit); $("totalCost").textContent=money(result.totalCosts); $("totalRevenue").textContent=money(result.totalRevenue); $("totalProfit").textContent=money(result.totalProfit);
    $("profitDescription").textContent=`Resultado estimado para ${result.quantity} unidade(s)/serviço(s).`;
    $("purchaseSummaryLabel").textContent=result.mode==="resale"?`Compra em ${result.sourceCurrency}`:"Materiais e ingredientes";
    $("purchaseSummary").textContent=result.mode==="resale"?`${money(result.originalCost).replace(" MT","")} ${result.sourceCurrency}`:money(result.originalCost);
    $("convertedCostLabel").textContent=result.mode==="resale"?`Conversão (${result.exchangeRate} MT por ${result.sourceCurrency})`:"Materiais convertidos para MZN";
    $("convertedCost").textContent=money(result.convertedCost);
    $("expensesSummaryLabel").textContent=result.mode==="service"?"Mão de obra, deslocação e despesas":"Mão de obra, custos e despesas";
    $("expensesSummary").textContent=money(result.labor+result.directExpenses+result.expenses);
    $("quantitySummary").textContent=String(result.quantity); $("exactPrice").textContent=money(result.exactPrice);
    $("resultNotice").textContent="O preço recomendado foi arredondado para cima ao cêntimo, para não ficar abaixo da margem pretendida.";
    $("results").scrollIntoView({behavior:"smooth",block:"start"});
  }
  function saveCalculation(result) {
  const index = history.findIndex(item => item.id === result.id);

  if (index >= 0) {
    history[index] = result;
  } else {
    history.unshift(result);
  }

  persistHistory();
  renderHistory();

  if (currentUserId) {
    void saveCalculationToSupabase(result);
  }
}
  function renderHistory() {
    $("historyCount").textContent=history.length;
    $("historyTotalCost").textContent=money(history.reduce((sum,item)=>sum+number(item.totalCosts),0));
    $("historyTotalProfit").textContent=money(history.reduce((sum,item)=>sum+number(item.totalProfit),0));
    const list=$("historyList"); list.innerHTML="";
    if(!history.length){list.innerHTML='<p class="history-empty">Ainda não existem cálculos guardados.</p>';return;}
    history.forEach(item=>{
      const article=document.createElement("article"); article.className="history-item";
      const info=document.createElement("div"); const title=document.createElement("h3"); title.textContent=item.name;
      const date=new Date(item.date).toLocaleString("pt-MZ",{dateStyle:"short",timeStyle:"short"});
      const detail=document.createElement("p"); detail.textContent=`${modeLabel(item.mode)} · ${date} · Lucro total: ${money(item.totalProfit)}`; info.append(title,detail);
      const price=document.createElement("strong"); price.textContent=money(item.sellingPrice);
      const actions=document.createElement("div"); actions.className="history-item-actions";
      const edit=document.createElement("button"); edit.type="button"; edit.textContent="Editar"; edit.addEventListener("click",()=>loadCalculationForEditing(item.id));
      const remove=document.createElement("button"); remove.type="button"; remove.className="delete"; remove.textContent="Eliminar"; remove.addEventListener("click",()=>deleteCalculation(item.id));
      actions.append(edit,remove);

      // Detalhes expansíveis de cada cálculo guardado.
      const details=document.createElement("details"); details.className="history-details";
      const summary=document.createElement("summary"); summary.textContent="Detalhes do cálculo";
      const detailContent=document.createElement("div"); detailContent.className="history-detail-content";
      const rows=[
        ["Modo",modeLabel(item.mode)],
        ["Quantidade",String(item.quantity??0)],
        ["Custo total",money(item.totalCosts)],
        ["Custo por unidade",money(item.unitCost)],
        ["Mão de obra",money(item.labor)],
        [item.mode==="service"?"Deslocação e outras despesas":"Despesas adicionais",money(item.directExpenses??item.expenses)],
        ["Margem pretendida",`${number(item.margin)}%`],
        ["Preço exacto",money(item.exactPrice)],
        ["Preço recomendado por unidade",money(item.sellingPrice)],
        ["Lucro por unidade",money(item.unitProfit)],
        ["Receita total estimada",money(item.totalRevenue)],
        ["Lucro total estimado",money(item.totalProfit)]
      ];
      if(item.mode==="resale"){
        rows.splice(2,0,["Moeda de compra",item.sourceCurrency||"MZN"],["Taxa de câmbio",`${number(item.exchangeRate)||1} MT`],["Valor original da compra",`${number(item.originalCost).toLocaleString("pt-MZ",{minimumFractionDigits:2,maximumFractionDigits:2})} ${item.sourceCurrency||"MZN"}`]);
      }
      rows.forEach(([label,value])=>{
        const row=document.createElement("div"); row.className="history-detail-row";
        const name=document.createElement("span"); name.textContent=label;
        const val=document.createElement("strong"); val.textContent=value;
        row.append(name,val); detailContent.appendChild(row);
      });
      if(Array.isArray(item.ingredients)&&item.ingredients.length){
        const heading=document.createElement("h4"); heading.textContent=item.mode==="service"?"Materiais utilizados":"Ingredientes e materiais"; detailContent.appendChild(heading);
        item.ingredients.forEach(ingredient=>{
          const row=document.createElement("div"); row.className="history-detail-row";
          const name=document.createElement("span"); name.textContent=ingredient.name||"Material";
          const val=document.createElement("strong"); val.textContent=money(ingredient.converted??ingredient.cost);
          row.append(name,val); detailContent.appendChild(row);
        });
      }
      details.append(summary,detailContent);
      article.append(info,price,actions,details); list.appendChild(article);
    });
  }
  function modeLabel(mode){return mode==="production"?"Fabrico":mode==="service"?"Serviços":"Revenda";}
  function loadCalculationForEditing(id) {
    const item=history.find(entry=>entry.id===id); if(!item)return;
    editingHistoryId=item.id; fields.name.value=item.name; fields.mode.value=item.mode; fields.quantity.value=item.quantity; fields.margin.value=item.margin; fields.expenses.value=item.expenses??0; fields.labor.value=item.labor??0; fields.productionExpenses.value=item.directExpenses??0;
    fields.currency.value=item.sourceCurrency||"MZN"; fields.cost.value=item.originalCost??""; fields.rate.value=item.exchangeRate||1;
    fields.ingredients.innerHTML=""; (item.ingredients?.length?item.ingredients:[{}]).forEach(ingredient=>addIngredientRow({name:ingredient.name,cost:ingredient.cost,currency:ingredient.currency,rate:ingredient.rate}));
    updateMode(); updateCurrency(); $("resetButton").textContent="Cancelar edição"; $("calculadora").scrollIntoView({behavior:"smooth"});
  }
 function deleteCalculation(id) {
  history = history.filter(item => item.id !== id);
  persistHistory();

  if (editingHistoryId === id) resetForm();

  renderHistory();

  if (currentUserId) {
  const userId = currentUserId;
  const key = PENDING_DELETE_PREFIX + userId;
    const pending = readJSON(key, []);

    if (!pending.includes(String(id))) {
      pending.push(String(id));
      saveJSON(key, pending);
    }

    void (async () => {
      try {
        const { error } = await supabaseClient
          .from("calculation_history")
          .delete()
          .eq("user_id", userId)
          .eq("calculation_id", String(id));

        if (error) throw error;

        const remaining = readJSON(key, [])
          .filter(item => item !== String(id));

        if (remaining.length) {
          saveJSON(key, remaining);
        } else {
          localStorage.removeItem(key);
        }

      } catch (error) {
        console.error("A eliminação ficará pendente de sincronização:", error);
      }
    })();
  }
}
  function resetForm(){fields.form.reset();fields.mode.value="resale";fields.currency.value="MZN";fields.rate.value="1";fields.ingredients.innerHTML="";addIngredientRow();editingHistoryId=null;latestResult=null;$("resetButton").textContent="Fazer novo cálculo";$("resultContent").hidden=true;$("emptyResults").hidden=false;updateMode();updateCurrency();hideError();saveFormData();}
  function exportHistory(){if(!history.length){alert("Ainda não existem cálculos para exportar.");return;}const rows=[["Nome","Modo","Data","Quantidade","Custo total (MZN)","Preço unitário (MZN)","Lucro unitário (MZN)","Lucro total (MZN)","Margem (%)"],...history.map(item=>[item.name,modeLabel(item.mode),new Date(item.date).toLocaleString("pt-MZ"),item.quantity,item.totalCosts,item.sellingPrice,item.unitProfit,item.totalProfit,item.actualMargin])];const csv="\uFEFF"+rows.map(row=>row.map(value=>`"${String(value??"").replace(/"/g,'""')}"`).join(";")).join("\r\n");const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="historico-quanto-devo-cobrar.csv";document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);}
  async function shareResult(){if(!latestResult)return;const r=latestResult;const text=`QUANTO DEVO COBRAR?\nProduto/serviço: ${r.name}\nModo: ${modeLabel(r.mode)}\nPreço recomendado: ${money(r.sellingPrice)}\nCusto por unidade: ${money(r.unitCost)}\nLucro por unidade: ${money(r.unitProfit)}\nQuantidade: ${r.quantity}\nLucro total estimado: ${money(r.totalProfit)}`;try{if(navigator.share)await navigator.share({title:"Resultado | Quanto Devo Cobrar?",text});else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);$("resultNotice").textContent="Resultado copiado. Já podes colá-lo numa mensagem.";}else{$("resultNotice").textContent=text;}}catch(error){if(error.name!=="AbortError")$("resultNotice").textContent="Não foi possível partilhar automaticamente. Podes copiar os valores apresentados.";}}


let passwordRecoveryMode =
  window.location.hash.includes("type=recovery") ||
  new URLSearchParams(window.location.search).get("type") === "recovery";

function updateAuthUI(user) {
  const authForm = $("authForm");
  const loggedInArea = $("loggedInArea");
  const recoveryPanel = $("recoveryPanel");
  const newPasswordPanel = $("newPasswordPanel");

  if (passwordRecoveryMode) {
    authForm.hidden = true;
    loggedInArea.hidden = true;

    if (recoveryPanel) recoveryPanel.hidden = true;
    if (newPasswordPanel) newPasswordPanel.hidden = false;

    $("accountToggle").textContent = "Nova palavra-passe";
    return;
  }

  authForm.hidden = !!user;
  loggedInArea.hidden = !user;

  if (recoveryPanel) recoveryPanel.hidden = true;
  if (newPasswordPanel) newPasswordPanel.hidden = true;

  $("loggedInEmail").textContent = user?.email || "";

  $("accountToggle").textContent = user
    ? "Conta ligada"
    : "A minha conta";
}

function authErrorMessage(error) {
  const errorText = String(error?.message || "").toLowerCase();

  if (errorText.includes("invalid login credentials")) {
    return "E-mail ou palavra-passe incorrectos.";
  }

  if (errorText.includes("email not confirmed")) {
    return "Confirma primeiro o teu endereço de e-mail.";
  }

  if (
    errorText.includes("already registered") ||
    errorText.includes("user already exists")
  ) {
    return "Este e-mail já tem uma conta. Experimenta iniciar sessão.";
  }

  if (errorText.includes("password should be at least")) {
    return "A palavra-passe deve ter pelo menos 8 caracteres.";
  }

  if (
    errorText.includes("rate limit") ||
    errorText.includes("too many requests")
  ) {
    return "Foram feitas demasiadas tentativas. Aguarda alguns minutos.";
  }

  if (errorText.includes("network")) {
    return "Problema de ligação. Verifica a tua internet.";
  }

  return error?.message || "Ocorreu um erro. Tenta novamente.";
}

function setupPasswordVisibility() {
  document.querySelectorAll(".toggle-password").forEach(button => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.target);

      if (!input) return;

      const isHidden = input.type === "password";

      input.type = isHidden ? "text" : "password";

      button.setAttribute(
        "aria-label",
        isHidden ? "Esconder palavra-passe" : "Mostrar palavra-passe"
      );

      button.title = isHidden
        ? "Esconder palavra-passe"
        : "Mostrar palavra-passe";

      button.classList.toggle("password-visible", isHidden);
    });
  });
}

async function setupAuth() {
  const form = $("authForm");

  if (!form) return;

  const message = $("authMessage");
  const signUpButton = $("signUpButton");
  const signInButton = $("signInButton");
  const emailInput = $("authEmail");
  const passwordInput = $("authPassword");

  function showMessage(text, type = "info") {
    message.textContent = text;
    message.dataset.type = type;
  }

  function setLoading(button, loading, text) {
    button.disabled = loading;

    if (loading) {
      button.dataset.originalText = button.textContent;
      button.textContent = text;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
    }
  }

  if (!window.supabase?.createClient) {
    showMessage("Não foi possível carregar o serviço de contas.");
    return;
  }

  try {
    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );

    const { data, error } = await supabaseClient.auth.getSession();

if (error) throw error;

updateAuthUI(data.session?.user || null);

// Recuperar ou sincronizar o histórico da sessão actual.
await handleAuthSession(data.session);

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    passwordRecoveryMode = true;

    document.querySelector(".account-menu")?.setAttribute("open", "");
  }

  updateAuthUI(session?.user || null);

  // Executar a sincronização fora do callback de autenticação.
  setTimeout(() => {
    void handleAuthSession(session);
  }, 0);
});

  } catch (error) {
    console.error("Erro ao ligar ao Supabase:", error);
    showMessage("Não foi possível ligar ao serviço de contas. Tenta novamente.");
    return;
  }

  // Criar a interface de recuperação de palavra-passe.
  const recoveryPanel = document.createElement("div");
  recoveryPanel.id = "recoveryPanel";
  recoveryPanel.className = "auth-extra-panel";
  recoveryPanel.hidden = true;

  recoveryPanel.innerHTML = `
    <h3>Recuperar palavra-passe</h3>
    <p>Introduz o teu e-mail. Enviaremos um link para criares uma nova palavra-passe.</p>

    <label for="recoveryEmail">E-mail</label>
    <input
      type="email"
      id="recoveryEmail"
      placeholder="teuemail@exemplo.com"
      required
    >

    <div class="auth-buttons">
      <button type="button" id="sendRecoveryButton">
        Enviar link
      </button>

      <button type="button" id="cancelRecoveryButton">
        Voltar
      </button>
    </div>

    <p id="recoveryMessage" role="status" aria-live="polite"></p>
  `;

  form.insertAdjacentElement("afterend", recoveryPanel);

  // Criar a interface para definir uma nova palavra-passe.
  const newPasswordPanel = document.createElement("div");
  newPasswordPanel.id = "newPasswordPanel";
  newPasswordPanel.className = "auth-extra-panel";
  newPasswordPanel.hidden = true;

  newPasswordPanel.innerHTML = `
    <h3>Definir nova palavra-passe</h3>
    <p>Escolhe uma nova palavra-passe para a tua conta.</p>

    <label for="newPassword">Nova palavra-passe</label>
    <input
      type="password"
      id="newPassword"
      minlength="8"
      autocomplete="new-password"
      placeholder="Mínimo de 8 caracteres"
      required
    >

    <label for="confirmNewPassword">Confirmar palavra-passe</label>
    <input
      type="password"
      id="confirmNewPassword"
      minlength="8"
      autocomplete="new-password"
      placeholder="Repete a palavra-passe"
      required
    >

    <button type="button" id="saveNewPasswordButton" class="primary-button">
      Guardar nova palavra-passe
    </button>

    <p id="newPasswordMessage" role="status" aria-live="polite"></p>
  `;

  recoveryPanel.insertAdjacentElement("afterend", newPasswordPanel);

if (passwordRecoveryMode) {
  updateAuthUI(null);
}

  const recoveryEmail = $("recoveryEmail");
  const recoveryMessage = $("recoveryMessage");
  const sendRecoveryButton = $("sendRecoveryButton");

  // Abrir recuperação de palavra-passe.
  const forgotButton = document.createElement("button");
  forgotButton.type = "button";
  forgotButton.id = "forgotPasswordButton";
  forgotButton.className = "auth-link-button";
  forgotButton.textContent = "Esqueci-me da palavra-passe";

  form.appendChild(forgotButton);

  forgotButton.addEventListener("click", () => {
    recoveryEmail.value = emailInput.value.trim();
    recoveryPanel.hidden = false;
    newPasswordPanel.hidden = true;
    message.textContent = "";
    recoveryMessage.textContent = "";

    recoveryEmail.focus();
  });

  // Voltar ao formulário de início de sessão.
  $("cancelRecoveryButton").addEventListener("click", () => {
    recoveryPanel.hidden = true;
    recoveryMessage.textContent = "";
  });

  // Enviar o e-mail de recuperação.
  sendRecoveryButton.addEventListener("click", async () => {
    const email = recoveryEmail.value.trim();

    if (!email || !recoveryEmail.checkValidity()) {
      recoveryMessage.textContent = "Introduz um endereço de e-mail válido.";
      return;
    }

    setLoading(sendRecoveryButton, true, "A enviar...");

    try {
      const redirectUrl =
        window.location.origin +
        window.location.pathname +
        "?type=recovery";

      const { error } =
        await supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: redirectUrl
        });

      if (error) throw error;

      recoveryMessage.textContent =
        "Se o e-mail estiver registado, receberás uma mensagem com o link de recuperação. Verifica também a pasta de spam.";

    } catch (error) {
      console.error("Erro na recuperação:", error);
      recoveryMessage.textContent = authErrorMessage(error);

    } finally {
      setLoading(sendRecoveryButton, false);
    }
  });

  // Iniciar sessão.
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!supabaseClient) {
      showMessage("Serviço de contas indisponível.");
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showMessage("Preenche o e-mail e a palavra-passe.");
      return;
    }

    setLoading(signInButton, true, "A verificar...");

    try {
      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;
  showMessage("Sessão iniciada com sucesso.", "success");

  form.reset();

  updateAuthUI(data.user);

    } catch (error) {
      console.error("Erro ao iniciar sessão:", error);
      showMessage(authErrorMessage(error), "error");

    } finally {
      setLoading(signInButton, false);
    }
  });

  // Criar conta.
  signUpButton.addEventListener("click", async () => {
    if (!supabaseClient) {
      showMessage("Serviço de contas indisponível.");
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !emailInput.checkValidity()) {
      showMessage("Introduz um endereço de e-mail válido.");
      return;
    }

    if (password.length < 8) {
      showMessage("A palavra-passe deve ter pelo menos 8 caracteres.");
      return;
    }

    setLoading(signUpButton, true, "A criar conta...");

    try {
      const redirectUrl =
  "https://olencia4.github.io/quanto-devo-cobrar/";

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl
        }
      });

      if (error) throw error;

      if (data.session) {
        showMessage("Conta criada com sucesso.", "success");
        updateAuthUI(data.session.user);

      } else {
        showMessage(
          "Registo recebido. Verifica o teu e-mail para confirmares a conta antes de iniciares sessão.",
          "success"
        );
      }

    } catch (error) {
      console.error("Erro ao criar conta:", error);
      showMessage(authErrorMessage(error), "error");

    } finally {
      setLoading(signUpButton, false);
    }
  });

  // Guardar nova palavra-passe.
  $("saveNewPasswordButton").addEventListener("click", async () => {
    const newPassword = $("newPassword").value;
    const confirmPassword = $("confirmNewPassword").value;
    const saveButton = $("saveNewPasswordButton");
    const newPasswordMessage = $("newPasswordMessage");

    if (newPassword.length < 8) {
      newPasswordMessage.textContent =
        "A palavra-passe deve ter pelo menos 8 caracteres.";
      return;
    }

    if (newPassword !== confirmPassword) {
      newPasswordMessage.textContent =
        "As palavras-passe não coincidem.";
      return;
    }

    setLoading(saveButton, true, "A guardar...");

    try {
      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      await supabaseClient.auth.signOut();

      passwordRecoveryMode = false;

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );

      updateAuthUI(null);

      emailInput.value = recoveryEmail.value.trim();
      passwordInput.value = "";

      showMessage(
        "Palavra-passe actualizada com sucesso. Já podes iniciar sessão.",
        "success"
      );

    } catch (error) {
      console.error("Erro ao actualizar palavra-passe:", error);
      newPasswordMessage.textContent = authErrorMessage(error);

    } finally {
      setLoading(saveButton, false);
    }
  });

  
  // Terminar sessão.
  $("signOutButton").addEventListener("click", async () => {
    if (!supabaseClient) return;

    const signOutButton = $("signOutButton");
    signOutButton.disabled = true;

    try {
      const { error } = await supabaseClient.auth.signOut();

      if (error) throw error;

      // Limpar os campos de autenticação.
      form.reset();

      // Limpar mensagens anteriores.
      showMessage("");

      // Actualizar a interface.
      updateAuthUI(null);

      // Voltar à calculadora.
      $("calculadora").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

      showMessage("Sessão terminada com sucesso.", "success");

    } catch (error) {
      console.error("Erro ao terminar sessão:", error);
      showMessage(authErrorMessage(error), "error");

    } finally {
      signOutButton.disabled = false;
    }
  });

}
  document.querySelectorAll(".mode-card").forEach(card=>card.addEventListener("click",()=>{fields.mode.value=card.dataset.mode;fields.mode.dispatchEvent(new Event("change"));}));
  fields.mode.addEventListener("change",updateMode); fields.currency.addEventListener("change",updateCurrency);
  fields.form.addEventListener("input",saveFormData);
  $("addIngredientButton").addEventListener("click",()=>{addIngredientRow();saveFormData();});
  fields.form.addEventListener("submit",event=>{event.preventDefault();hideError();try{const result=validateAndCalculate();saveCalculation(result);renderResult(result);editingHistoryId=null;$("resetButton").textContent="Fazer novo cálculo";saveFormData();}catch(error){showError(error.message||"Verifica os dados introduzidos.");}});
  $("shareButton").addEventListener("click",shareResult); $("resetButton").addEventListener("click",resetForm);
  $("clearHistoryButton").addEventListener("click", () => {
  if (!history.length) return;

  if (!confirm("Tens a certeza de que pretendes eliminar todo o teu histórico?")) {
    return;
  }

  history = [];
  persistHistory();

  if (currentUserId) {
    const userId = currentUserId;
    const clearKey = PENDING_CLEAR_PREFIX + userId;

    saveJSON(clearKey, true);

    void (async () => {
      try {
        const { error } = await supabaseClient
          .from("calculation_history")
          .delete()
          .eq("user_id", userId);

        if (error) throw error;

        localStorage.removeItem(clearKey);
        localStorage.removeItem(PENDING_DELETE_PREFIX + userId);

      } catch (error) {
        console.error("A eliminação total ficará pendente de sincronização:", error);
      }
    })();
  }

  resetForm();
  renderHistory();
});
  $("exportHistoryButton").addEventListener("click",exportHistory);
  loadFormData();
if (!fields.ingredients.querySelector(".ingredient-row")) addIngredientRow();
updateMode();
updateCurrency();
renderHistory();
setupPasswordVisibility();
setupAuth();
})();
