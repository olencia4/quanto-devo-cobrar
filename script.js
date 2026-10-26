
"use strict";

const form = document.getElementById("priceForm");
const results = document.getElementById("results");
const formError = document.getElementById("formError");

const fields = {
  name: document.getElementById("productName"),
  mode: document.getElementById("calculationMode"),
  currency: document.getElementById("currency"),
  cost: document.getElementById("purchaseCost"),
  exchangeRate: document.getElementById("exchangeRate"),
  quantity: document.getElementById("quantity"),
  expenses: document.getElementById("expenses"),
  margin: document.getElementById("margin")
};

const historyCount = document.getElementById("historyCount");
const historyTotalCost = document.getElementById("historyTotalCost");
const historyTotalProfit = document.getElementById("historyTotalProfit");


const shareButton = document.getElementById("shareButton");
const resetButton = document.getElementById("resetButton");
const historyList = document.getElementById("historyList");
const clearHistoryButton = document.getElementById("clearHistoryButton");
const exportHistoryButton = document.getElementById("exportHistoryButton");

const HISTORY_KEY = "quantoDevoCobrar_historico_v1";
const productionFields = document.getElementById("productionFields");
const ingredientsList = document.getElementById("ingredientsList");
const addIngredientButton = document.getElementById("addIngredientButton");
const laborCostField = document.getElementById("laborCost");
const productionExpensesField =
  document.getElementById("productionExpenses");

const currencyNames = {
  MZN: "Metical moçambicano",
  ZAR: "Rand sul-africano",
  USD: "Dólar americano",
  EUR: "Euro",
  GBP: "Libra esterlina",
  CNY: "Yuan chinês"
};

let lastResult = null;
let editingHistoryId = null;

const money = new Intl.NumberFormat("pt-MZ", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatMT(value) {
  return `${money.format(value)} MT`;
}

function formatOriginalCurrency(value, currency) {
  return new Intl.NumberFormat("pt-MZ", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatPercent(value) {
  return `${money.format(value)}%`;
}

function roundUpToCent(value) {
  return Math.ceil((value - 1e-10) * 100) / 100;
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function clearError() {
  formError.textContent = "";
  formError.hidden = true;
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function updateCurrency() {
  const currency = fields.currency.value;
  const isMZN = currency === "MZN";

  document.getElementById("purchaseCostHelp").textContent =
    `Introduz o valor na moeda selecionada (${currency}).`;

  fields.exchangeRate.disabled = isMZN;
  fields.exchangeRate.required =
    !isMZN && fields.mode.value === "resale";

  if (isMZN) {
    fields.exchangeRate.value = "1";
  } else if (fields.exchangeRate.value === "1") {
    fields.exchangeRate.value = "";
  }

  document.getElementById("exchangeRateHelp").textContent =
    `Quantos MZN pagaste por 1 ${currency}? Introduz a taxa aplicada à compra.`;

  updateCalculationMode();
}

function updateCalculationMode() {
  const isProduction = fields.mode.value === "production";

  productionFields.hidden = !isProduction;

  fields.currency.closest(".field").hidden = isProduction;
  fields.cost.closest(".field").hidden = isProduction;
  fields.expenses.closest(".field").hidden = isProduction;

  document.getElementById("exchangeRateField").hidden =
    isProduction || fields.currency.value === "MZN";

  // Campos obrigatórios para revenda
  fields.cost.required = !isProduction;
  fields.expenses.required = !isProduction;
  fields.exchangeRate.required =
    !isProduction && fields.currency.value !== "MZN";

  // Desativar campos de revenda durante o fabrico
  fields.cost.disabled = isProduction;
  fields.expenses.disabled = isProduction;
  fields.currency.disabled = isProduction;
  fields.exchangeRate.disabled =
    isProduction || fields.currency.value === "MZN";

  // Campos obrigatórios para fabrico
  laborCostField.required = isProduction;
  productionExpensesField.required = isProduction;
}


function addIngredientRow() {
  const row = document.createElement("div");
  row.className = "ingredient-row";

  row.innerHTML = `
    <div class="field">
      <label>Nome do ingrediente ou material</label>
      <input
        type="text"
        class="ingredient-name"
        placeholder="Ex.: Açúcar"
        maxlength="80"
      >
    </div>

    <div class="field">
      <label>Custo utilizado</label>
      <input
        type="number"
        class="ingredient-cost"
        min="0"
        step="0.01"
        placeholder="Ex.: 100"
      >
    </div>

    <div class="field">
      <label>Moeda</label>
      <select class="ingredient-currency">
        <option value="MZN">Metical (MZN)</option>
        <option value="ZAR">Rand (ZAR)</option>
        <option value="USD">Dólar (USD)</option>
        <option value="EUR">Euro (EUR)</option>
        <option value="GBP">Libra (GBP)</option>
        <option value="CNY">Yuan (CNY)</option>
      </select>
    </div>

    <div class="field">
      <label>Taxa para MZN</label>
      <input
        type="number"
        class="ingredient-rate"
        min="0.000001"
        step="any"
        value="1"
      >
      <small>Quantos MT pagaste por 1 unidade da moeda?</small>
    </div>
  `;

  ingredientsList.appendChild(row);

  const currencySelect = row.querySelector(".ingredient-currency");
  const rateInput = row.querySelector(".ingredient-rate");

  function updateIngredientCurrency() {
    const isMZN = currencySelect.value === "MZN";

    rateInput.disabled = isMZN;
    rateInput.required = !isMZN;
    rateInput.value = isMZN ? "1" : "";
  }

  currencySelect.addEventListener("change", updateIngredientCurrency);
  updateIngredientCurrency();

  row.querySelector(".ingredient-name").focus();
}

addIngredientButton.addEventListener("click", addIngredientRow);

const STORAGE_KEY = "quantoDevoCobrar_dados_v1";

function saveFormData() {
  const data = {
    fields: {
      name: fields.name.value,
      mode: fields.mode.value,
      currency: fields.currency.value,
      cost: fields.cost.value,
      exchangeRate: fields.exchangeRate.value,
      quantity: fields.quantity.value,
      expenses: fields.expenses.value,
      margin: fields.margin.value,
      laborCost: laborCostField.value,
      productionExpenses: productionExpensesField.value
    },

    ingredients: Array.from(
      ingredientsList.querySelectorAll(".ingredient-row")
    ).map((row) => ({
      name: row.querySelector(".ingredient-name").value,
      cost: row.querySelector(".ingredient-cost").value,
      currency: row.querySelector(".ingredient-currency")?.value || "MZN",
      rate: row.querySelector(".ingredient-rate")?.value || "1"
    }))
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Não foi possível guardar os dados.", error);
  }
}

function loadFormData() {
  let data;

  try {
    const savedData = localStorage.getItem(STORAGE_KEY);

    if (!savedData) {
      return;
    }

    data = JSON.parse(savedData);
  } catch (error) {
    console.warn("Não foi possível recuperar os dados.", error);
    return;
  }

  if (!data || !data.fields || !Array.isArray(data.ingredients)) {
    return;
  }

  const savedFields = data.fields;

  fields.name.value = savedFields.name ?? "";
  fields.mode.value = savedFields.mode ?? "resale";
  fields.currency.value = savedFields.currency ?? "MZN";
  fields.cost.value = savedFields.cost ?? "";
  fields.exchangeRate.value = savedFields.exchangeRate ?? "1";
  fields.quantity.value = savedFields.quantity ?? "";
  fields.expenses.value = savedFields.expenses ?? "";
  fields.margin.value = savedFields.margin ?? "";

  laborCostField.value = savedFields.laborCost ?? "";
  productionExpensesField.value =
    savedFields.productionExpenses ?? "";

  ingredientsList.innerHTML = "";

  for (const ingredient of data.ingredients) {
    addIngredientRow();

    const row = ingredientsList.lastElementChild;

    row.querySelector(".ingredient-name").value =
      ingredient.name ?? "";

    row.querySelector(".ingredient-cost").value =
      ingredient.cost ?? "";

    const currencySelect = row.querySelector(".ingredient-currency");
    const rateInput = row.querySelector(".ingredient-rate");

    currencySelect.value = ingredient.currency ?? "MZN";
    rateInput.disabled = currencySelect.value === "MZN";
    rateInput.required = currencySelect.value !== "MZN";
    rateInput.value =
      currencySelect.value === "MZN"
        ? "1"
        : ingredient.rate ?? "";
  }

  updateCurrency();
  updateCalculationMode();
}

form.addEventListener("input", saveFormData);
form.addEventListener("change", saveFormData);
addIngredientButton.addEventListener("click", saveFormData);

function calculate(event) {
  event.preventDefault();
  clearError();

  const name = fields.name.value.trim() || "Produto";
  const mode = fields.mode.value;
  const quantityText = fields.quantity.value.trim();
  const marginText = fields.margin.value.trim();

  if (quantityText === "" || marginText === "") {
    showError("Preenche a quantidade e a margem de lucro.");
    return;
  }

  const quantity = Number(quantityText);
  const margin = Number(marginText);

  if (
    !Number.isFinite(quantity) ||
    !Number.isFinite(margin)
  ) {
    showError("Introduz valores numéricos válidos.");
    return;
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    showError("A quantidade deve ser um número inteiro superior a zero.");
    return;
  }

  if (margin < 0 || margin >= 100) {
    showError("A margem deve estar entre 0% e menos de 100%.");
    return;
  }

  let originalCost = 0;
  let currency = "MZN";
  let exchangeRate = 1;
  let convertedCost = 0;
  let ingredientCost = 0;
  let laborCost = 0;
  let productionExpenses = 0;
  let expenses = 0;

  let ingredientsDetails = [];

  if (mode === "production") {
  const rows = ingredientsList.querySelectorAll(".ingredient-row");
  const ingredientNames = [];

  for (const row of rows) {
    const ingredientName =
      row.querySelector(".ingredient-name").value.trim();

    const costText =
      row.querySelector(".ingredient-cost").value.trim();

    const currency =
      row.querySelector(".ingredient-currency").value;

    const rateInput =
      row.querySelector(".ingredient-rate");

    const rateText = rateInput.value.trim();

    if (ingredientName === "" && costText === "") {
      continue;
    }

    if (ingredientName === "" || costText === "") {
      showError("Preenche o nome e o custo de cada ingrediente.");
      return;
    }

    const cost = Number(costText);
    const rate = currency === "MZN" ? 1 : Number(rateText);

    if (!Number.isFinite(cost) || cost <= 0) {
      showError("O custo de cada ingrediente deve ser superior a zero.");
      return;
    }

    if (!Number.isFinite(rate) || rate <= 0 || rateText === "") {
      showError(
        `Introduz uma taxa de câmbio válida para "${ingredientName}".`
      );
      rateInput.focus();
      return;
    }

    ingredientCost += cost * rate;
ingredientNames.push(ingredientName);

ingredientsDetails.push({
  name: ingredientName,
  cost: cost,
  currency: currency,
  exchangeRate: rate,
  costInMZN: cost * rate
});
  }

  if (ingredientNames.length === 0 || ingredientCost <= 0) {
    showError("Adiciona pelo menos um ingrediente com custo válido.");
    return;
  }

  const laborText = laborCostField.value.trim();
  const productionExpensesText =
    productionExpensesField.value.trim();

  if (laborText === "" || productionExpensesText === "") {
    showError("Preenche a mão de obra e as outras despesas. Usa 0 se não houver custos.");
    return;
  }

  laborCost = Number(laborText);
  productionExpenses = Number(productionExpensesText);

  if (
    !Number.isFinite(laborCost) ||
    !Number.isFinite(productionExpenses) ||
    laborCost < 0 ||
    productionExpenses < 0
  ) {
    showError("Os custos de produção não podem ser negativos.");
    return;
  }

  convertedCost = ingredientCost;
  expenses = laborCost + productionExpenses;
  } else {
    currency = fields.currency.value;

    const costText = fields.cost.value.trim();
    const expensesText = fields.expenses.value.trim();
    const rateText = fields.exchangeRate.value.trim();

    if (
      costText === "" ||
      expensesText === "" ||
      (currency !== "MZN" && rateText === "")
    ) {
      showError("Preenche todos os campos obrigatórios.");
      return;
    }

    originalCost = Number(costText);
    expenses = Number(expensesText);
    exchangeRate =
      currency === "MZN" ? 1 : Number(rateText);

    if (
      !Number.isFinite(originalCost) ||
      !Number.isFinite(expenses) ||
      !Number.isFinite(exchangeRate)
    ) {
      showError("Introduz valores numéricos válidos.");
      return;
    }

    if (originalCost <= 0) {
      showError("O custo da compra deve ser superior a zero.");
      return;
    }

    if (expenses < 0 || exchangeRate <= 0) {
      showError(
        "As despesas não podem ser negativas e a taxa deve ser superior a zero."
      );
      return;
    }

    convertedCost = originalCost * exchangeRate;
  }

  const totalCost = convertedCost + expenses;
  const unitCost = totalCost / quantity;
  const exactPrice = unitCost / (1 - margin / 100);
  const sellingPrice = roundUpToCent(exactPrice);
  const unitProfit = sellingPrice - unitCost;
  const totalRevenue = sellingPrice * quantity;
  const totalProfit = totalRevenue - totalCost;
  const actualMargin = (unitProfit / sellingPrice) * 100;

  lastResult = {
    name,
    mode,
   ingredientsDetails,
    currency,
    originalCost,
    exchangeRate,
    convertedCost,
    ingredientCost,
    laborCost,
    productionExpenses,
    expenses,
    quantity,
    margin,
    totalCost,
    unitCost,
    exactPrice,
    sellingPrice,
    unitProfit,
    totalRevenue,
    totalProfit,
    actualMargin
  };

  setText("sellingPrice", formatMT(sellingPrice));
  setText(
    "priceExplanation",
    `Margem pretendida: ${formatPercent(margin)}.`
  );
  setText("actualMargin", formatPercent(actualMargin));
  setText("unitCost", formatMT(unitCost));
  setText("unitProfit", formatMT(unitProfit));
  setText("totalCost", formatMT(totalCost));
  setText("totalRevenue", formatMT(totalRevenue));
  setText("totalProfit", formatMT(totalProfit));

 setText(
  "purchaseSummaryLabel",
  mode === "production"
    ? "Custo dos ingredientes e materiais"
    : "Custo da compra"
);

setText(
  "purchaseSummary",
  mode === "production"
    ? formatMT(ingredientCost)
    : formatOriginalCurrency(originalCost, currency)
);

setText(
  "convertedCostLabel",
  mode === "production"
    ? "Ingredientes e materiais convertidos para MZN"
    : "Custo convertido para MZN"
);

setText("convertedCost", formatMT(convertedCost));

setText(
  "expensesSummaryLabel",
  mode === "production"
    ? "Mão de obra e outras despesas de produção"
    : "Despesas adicionais"
);

setText("expensesSummary", formatMT(expenses));
setText("quantitySummary", String(quantity));
setText("exactPrice", formatMT(exactPrice));

  setText(
    "profitDescription",
    `Lucro estimado por unidade: ${formatMT(unitProfit)}.`
  );

  setText(
    "resultNotice",
    mode === "production"
      ? `Cálculo de fabrico para ${name}. Foram incluídos ingredientes, mão de obra e outras despesas indicadas.`
      : `Cálculo de revenda para ${name}. A compra foi convertida para MZN usando a taxa introduzida.`
  );
    const saved = saveCalculationToHistory(lastResult);

  if (!saved) {
    return;
  }

  results.hidden = false;
  results.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function createShareMessage() {
  if (!lastResult) {
    return "";
  }

  const r = lastResult;

  const lines = [
    "QUANTO DEVO COBRAR?",
    `Modo: ${r.mode === "production" ? "Fabrico" : "Revenda"}`,
    `Produto: ${r.name}`
  ];

  if (r.mode === "production") {
    lines.push(
      `Ingredientes e materiais: ${formatMT(r.ingredientCost)}`,
      `Mão de obra: ${formatMT(r.laborCost)}`,
      `Outras despesas de produção: ${formatMT(r.productionExpenses)}`
    );
  } else {
    lines.push(
      `Custo original: ${formatOriginalCurrency(r.originalCost, r.currency)}`,
      `Taxa de câmbio: 1 ${r.currency} = ${formatMT(r.exchangeRate)}`,
      `Custo convertido: ${formatMT(r.convertedCost)}`,
      `Despesas adicionais: ${formatMT(r.expenses)}`
    );
  }

  lines.push(
    `Custo total: ${formatMT(r.totalCost)}`,
    `Quantidade: ${r.quantity}`,
    `Custo por unidade: ${formatMT(r.unitCost)}`,
    `Margem pretendida: ${formatPercent(r.margin)}`,
    `Preço de venda por unidade: ${formatMT(r.sellingPrice)}`,
    `Lucro por unidade: ${formatMT(r.unitProfit)}`,
    `Receita total: ${formatMT(r.totalRevenue)}`,
    `Lucro total estimado: ${formatMT(r.totalProfit)}`
  );

  return lines.join("\n");
}

async function copyMessage(message) {
  try {
    await navigator.clipboard.writeText(message);
    showError("Resultado copiado. Podes colá-lo onde quiseres.");
  } catch (error) {
    showError(
      "Não foi possível copiar automaticamente. Tenta partilhar pelo navegador."
    );
  }
}

shareButton.addEventListener("click", async () => {
  if (!lastResult) {
    showError("Faz primeiro um cálculo.");
    return;
  }

  const message = createShareMessage();

  if (navigator.share) {
    try {
      await navigator.share({
        title: "Quanto Devo Cobrar?",
        text: message
      });
    } catch (error) {
      if (error.name !== "AbortError") {
        await copyMessage(message);
      }
    }
  } else {
    await copyMessage(message);
  }
});

resetButton.addEventListener("click", () => {
  form.reset();
  lastResult = null;
  clearError();
  results.hidden = true;

  localStorage.removeItem(STORAGE_KEY);

  ingredientsList.innerHTML = "";
  addIngredientRow();

  updateCurrency();
  updateCalculationMode();

  fields.name.focus();
});

fields.mode.addEventListener("change", updateCalculationMode);
fields.currency.addEventListener("change", updateCurrency);
form.addEventListener("submit", calculate);

loadFormData();
updateCurrency();
updateCalculationMode();


function getCalculationHistory() {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    return [];
  }
}



function saveCalculationToHistory(result) {
  const history = getCalculationHistory();
  let updatedHistory;

  if (editingHistoryId !== null) {
    const index = history.findIndex(
      (item) => item.id === editingHistoryId
    );

    if (index === -1) {
      showError("Não foi possível encontrar o registo que estás a editar.");
      return false;
    }

    updatedHistory = [...history];

    updatedHistory[index] = {
      ...result,
      id: history[index].id,
      date: history[index].date
    };
  } else {
    updatedHistory = [
      {
        ...result,
        id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
        date: new Date().toISOString()
      },
      ...history
    ];
  }

  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(updatedHistory.slice(0, 50))
    );
  } catch (error) {
    showError("Não foi possível guardar o cálculo no histórico.");
    return false;
  }

  editingHistoryId = null;
  renderHistory();

  const submitButton = form.querySelector('button[type="submit"]');

  if (submitButton) {
    submitButton.textContent = "Calcular preço de venda";
  }

  return true;
}


function renderHistory() {
  const history = getCalculationHistory();


historyCount.textContent = String(history.length);

const totalHistoryCost = history.reduce(
  (sum, item) => sum + Number(item.totalCost || 0),
  0
);

const totalHistoryProfit = history.reduce(
  (sum, item) => sum + Number(item.totalProfit || 0),
  0
);

historyTotalCost.textContent =
  money.format(totalHistoryCost) + " MZN";

historyTotalProfit.textContent =
  money.format(totalHistoryProfit) + " MZN";


  historyList.replaceChildren();

  if (history.length === 0) {
    const message = document.createElement("p");
    message.textContent = "Ainda não existem cálculos guardados.";
    historyList.appendChild(message);
    return;
  }

  history.forEach((item) => {
    const card = document.createElement("article");
    card.className = "history-item";

    const title = document.createElement("h3");
    title.textContent = item.name || "Produto sem nome";

    const date = document.createElement("p");
    date.textContent = new Date(item.date).toLocaleString("pt-MZ");

    const mode = document.createElement("p");
    mode.textContent =
      item.mode === "production" ? "Modo: Fabrico" : "Modo: Revenda";

    const price = document.createElement("p");
    price.textContent =
      "Preço de venda unitário: " +
      money.format(item.sellingPrice) + " MZN";

    const cost = document.createElement("p");
    cost.textContent =
      "Custo total: " + money.format(item.totalCost) + " MZN";

    const profit = document.createElement("p");
    profit.textContent =
      "Lucro total estimado: " + money.format(item.totalProfit) + " MZN";

    const details = document.createElement("div");
    details.hidden = true;

    
const quantity = document.createElement("p");
quantity.textContent = "Quantidade: " + item.quantity;

const totalCostDetail = document.createElement("p");
totalCostDetail.textContent =
  "Custo total de produção: " + money.format(item.totalCost) + " MZN";

const unitCost = document.createElement("p");
unitCost.textContent =
  "Custo por unidade: " + money.format(item.unitCost) + " MZN";


    const expenses = document.createElement("p");
    expenses.textContent =
      "Despesas adicionais: " + money.format(item.expenses) + " MZN";

details.append(
  quantity,
  totalCostDetail,
  unitCost,
  expenses
);


    if (item.mode === "production") {
      const labor = document.createElement("p");
      labor.textContent =
        "Mão de obra: " + money.format(item.laborCost || 0) + " MZN";

      const productionExpenses = document.createElement("p");
      productionExpenses.textContent =
        "Outras despesas de produção: " +
        money.format(item.productionExpenses || 0) + " MZN";

      details.append(labor, productionExpenses);

      
if (Array.isArray(item.ingredientsDetails)) {
  const ingredientsTotal = document.createElement("p");
  ingredientsTotal.textContent =
    "Total dos ingredientes: " +
    money.format(
      item.ingredientsDetails.reduce(
        (sum, ingredient) => sum + Number(ingredient.costInMZN || 0),
        0
      )
    ) + " MZN";

  details.appendChild(ingredientsTotal);

  const heading = document.createElement("h4");
  heading.textContent = "Ingredientes e materiais";
  details.appendChild(heading);


        item.ingredientsDetails.forEach((ingredient) => {
          const line = document.createElement("p");
          line.textContent =
            ingredient.name + ": " +
            money.format(ingredient.cost) + " " +
            ingredient.currency + " — " +
            money.format(ingredient.costInMZN) + " MZN";
          details.appendChild(line);
        });
      }
    }

    const toggleDetails = document.createElement("button");
    toggleDetails.type = "button";
    toggleDetails.textContent = "Ver detalhes";

    toggleDetails.addEventListener("click", () => {
      details.hidden = !details.hidden;
      toggleDetails.textContent = details.hidden
        ? "Ver detalhes"
        : "Ocultar detalhes";
    });

    const editButton = document.createElement("button");
editButton.type = "button";
editButton.textContent = "Editar";

editButton.addEventListener("click", () => {
  loadCalculationForEditing(item);
});

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Eliminar registo";

    deleteButton.addEventListener("click", () => {
      const updatedHistory = getCalculationHistory().filter(
        (entry) => entry.id !== item.id
      );

      localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
      renderHistory();
    });

    card.append(
      title,
      date,
      mode,
      price,
      cost,
      profit,
      toggleDetails,
      details,
      editButton,
      deleteButton
    );

    historyList.appendChild(card);
  });
}

function loadCalculationForEditing(item) {
  editingHistoryId = item.id;

 // Preencher os campos principais
fields.name.value = item.name || "";
fields.mode.value = item.mode || "resale";

// Atualizar primeiro a apresentação do formulário
updateCalculationMode();

fields.currency.value = item.currency || "MZN";
fields.cost.value = item.originalCost ?? "";
fields.exchangeRate.value = item.exchangeRate ?? 1;
fields.quantity.value = item.quantity ?? "";
fields.expenses.value = item.expenses ?? 0;
fields.margin.value = item.margin ?? 40;

updateCurrency();

  // Preencher os campos específicos do fabrico
  if (item.mode === "production") {
    laborCostField.value = item.laborCost ?? 0;
    productionExpensesField.value = item.productionExpenses ?? 0;

    ingredientsList.replaceChildren();

    if (
      Array.isArray(item.ingredientsDetails) &&
      item.ingredientsDetails.length > 0
    ) {
      item.ingredientsDetails.forEach((ingredient) => {
        addIngredientRow();

        const rows = ingredientsList.querySelectorAll(".ingredient-row");
        const row = rows[rows.length - 1];

        row.querySelector(".ingredient-name").value =
          ingredient.name || "";

        row.querySelector(".ingredient-cost").value =
          ingredient.cost ?? "";

        row.querySelector(".ingredient-currency").value =
          ingredient.currency || "MZN";

        row.querySelector(".ingredient-rate").value =
          ingredient.exchangeRate ?? 1;
      });
    } else {
      addIngredientRow();
    }
  }

  // Mostrar o formulário e ocultar resultados anteriores
  results.hidden = true;
  clearError();

  // Alterar o texto do botão de cálculo
  const submitButton = form.querySelector('button[type="submit"]');

  if (submitButton) {
    submitButton.textContent = "Guardar alterações";
  }

  // Levar o utilizador até ao formulário
  form.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

clearHistoryButton.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

renderHistory();

function exportHistoryToCSV() {
  const history = getCalculationHistory();

  if (history.length === 0) {
    alert("Não existem cálculos no histórico para exportar.");
    return;
  }

  const headers = [
    "Data",
    "Produto",
    "Modo",
    "Quantidade",
    "Custo dos ingredientes (MZN)",
    "Mão de obra (MZN)",
    "Outras despesas (MZN)",
    "Custo total (MZN)",
    "Custo por unidade (MZN)",
    "Preço de venda unitário (MZN)",
    "Lucro por unidade (MZN)",
    "Receita total (MZN)",
    "Lucro total (MZN)"
  ];

  function csvCell(value) {
    let text = String(value ?? "");

    // Evitar que o Excel interprete texto como fórmula
    if (/^[=+\-@\t\r]/.test(text)) {
      text = "'" + text;
    }

    return '"' + text.replace(/"/g, '""') + '"';
  }

  const rows = history.map((item) => {
    const ingredientsTotal = Array.isArray(item.ingredientsDetails)
      ? item.ingredientsDetails.reduce(
          (sum, ingredient) =>
            sum + Number(ingredient.costInMZN || 0),
          0
        )
      : Number(item.ingredientCost || 0);

    return [
      new Date(item.date).toLocaleString("pt-MZ"),
      item.name || "Produto",
      item.mode === "production" ? "Fabrico" : "Revenda",
      item.quantity,
      ingredientsTotal.toFixed(2),
      Number(item.laborCost || 0).toFixed(2),
      Number(item.productionExpenses || 0).toFixed(2),
      Number(item.totalCost || 0).toFixed(2),
      Number(item.unitCost || 0).toFixed(2),
      Number(item.sellingPrice || 0).toFixed(2),
      Number(item.unitProfit || 0).toFixed(2),
      Number(item.totalRevenue || 0).toFixed(2),
      Number(item.totalProfit || 0).toFixed(2)
    ];
  });

  const csv = [
    headers,
    ...rows
  ]
    .map((row) => row.map(csvCell).join(";"))
    .join("\r\n");

  // BOM para facilitar a leitura de caracteres acentuados no Excel
  const blob = new Blob(
    ["\uFEFF" + csv],
    { type: "text/csv;charset=utf-8;" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "historico_quanto_devo_cobrar.csv";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

exportHistoryButton.addEventListener(
  "click",
  exportHistoryToCSV
);
