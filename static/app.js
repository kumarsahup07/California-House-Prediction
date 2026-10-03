/**
 * HousePrice AI - Frontend Application Controller
 * Connects directly to existing FastAPI House Prediction backend
 */

// Dynamically determine API Base URL
const API_BASE = (window.location.protocol.startsWith('http') && window.location.port === '8000')
  ? '' 
  : 'http://127.0.0.1:8000';

// California Location Presets for convenience
const LOCATION_PRESETS = {
  sf_bay: { lat: 37.88, lon: -122.23, name: "San Francisco Bay / Berkeley" },
  silicon_valley: { lat: 37.38, lon: -122.08, name: "Silicon Valley / Mountain View" },
  los_angeles: { lat: 34.05, lon: -118.24, name: "Los Angeles Metropolitan" },
  san_diego: { lat: 32.71, lon: -117.16, name: "San Diego Coastal" },
  sacramento: { lat: 38.58, lon: -121.49, name: "Sacramento Valley" }
};

// Field validation limits matching backend Pydantic schema
const VALIDATION_RULES = {
  MedInc: { min: 0.5, max: 15.0, label: "Median Income ($10k)" },
  HouseAge: { min: 1, max: 52, label: "House Age (years)" },
  AveRooms: { min: 1.0, max: 15.0, label: "Average Rooms" },
  AveBedrms: { min: 0.5, max: 4.0, label: "Average Bedrooms" },
  Population: { min: 100, max: 35000, label: "Block Population" },
  AveOccup: { min: 1.0, max: 15.0, label: "Average Occupants" },
  Latitude: { min: 32.0, max: 42.0, label: "Latitude" },
  Longitude: { min: -125.0, max: -114.0, label: "Longitude" }
};

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const form = document.getElementById('prediction-form');
  const submitBtn = document.getElementById('submit-btn');
  const sampleBtn = document.getElementById('btn-fill-sample');
  const resetBtn = document.getElementById('btn-reset');
  const regionSelect = document.getElementById('preset-region');
  
  const errorAlert = document.getElementById('error-alert');
  const errorList = document.getElementById('error-list');
  const errorMessage = document.getElementById('error-message');
  
  const resultSection = document.getElementById('result-section');
  const estimatedPriceEl = document.getElementById('estimated-price');
  const priceBracketEl = document.getElementById('price-bracket');
  const resultExplanationEl = document.getElementById('result-explanation');
  
  const metricRooms = document.getElementById('metric-rooms');
  const metricIncome = document.getElementById('metric-income');
  const metricAge = document.getElementById('metric-age');
  const metricCoords = document.getElementById('metric-coords');
  const rawModelVal = document.getElementById('raw-model-value');

  const incomeInput = document.getElementById('MedInc');
  const incomeHint = document.getElementById('income-hint');
  const statusIndicator = document.getElementById('status-indicator');

  // Check backend health
  checkBackendHealth();

  // Live salary hint update as user types income
  incomeInput.addEventListener('input', () => {
    updateIncomeHint(incomeInput.value);
  });

  // Region preset selector change
  if (regionSelect) {
    regionSelect.addEventListener('change', (e) => {
      const presetKey = e.target.value;
      if (LOCATION_PRESETS[presetKey]) {
        document.getElementById('Latitude').value = LOCATION_PRESETS[presetKey].lat;
        document.getElementById('Longitude').value = LOCATION_PRESETS[presetKey].lon;
        clearFieldError('Latitude');
        clearFieldError('Longitude');
      }
    });
  }

  // Pre-fill Sample Data button
  sampleBtn.addEventListener('click', async () => {
    try {
      sampleBtn.disabled = true;
      sampleBtn.innerText = "Loading...";

      const res = await fetch(`${API_BASE}/predict/example`);
      if (!res.ok) throw new Error("Could not load sample data");
      
      const sample = await res.json();
      applyFormData(sample);
      clearAllErrors();
    } catch (err) {
      // Fallback local sample if offline
      applyFormData({
        MedInc: 4.0583,
        HouseAge: 41.0,
        AveRooms: 5.818,
        AveBedrms: 1.038,
        Population: 1127.0,
        AveOccup: 2.6,
        Latitude: 37.88,
        Longitude: -122.23
      });
      clearAllErrors();
    } finally {
      sampleBtn.disabled = false;
      sampleBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Fill Sample Property
      `;
    }
  });

  // Reset button
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      form.reset();
      updateIncomeHint(null);
      clearAllErrors();
      resultSection.classList.remove('visible');
    });
  }

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();

    // 1. Client-side validation
    const formData = extractFormData();
    const validationErrors = validateForm(formData);

    if (validationErrors.length > 0) {
      displayErrors(validationErrors, "Please correct the highlighted fields before submitting.");
      return;
    }

    // 2. Submit to API
    setLoadingState(true);

    try {
      const response = await fetch(`${API_BASE}/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        // Backend validation or internal error
        handleBackendError(response.status, data);
        return;
      }

      // 3. Render prediction
      displayPredictionResult(data);

    } catch (networkErr) {
      displayErrors([
        `Unable to reach the prediction server at ${API_BASE}.`,
        "Please ensure your FastAPI backend is running: uvicorn main:app --reload"
      ], "Connection Error");
    } finally {
      setLoadingState(false);
    }
  });

  // --- Helper Functions ---

  function extractFormData() {
    return {
      MedInc: parseFloat(document.getElementById('MedInc').value),
      HouseAge: parseFloat(document.getElementById('HouseAge').value),
      AveRooms: parseFloat(document.getElementById('AveRooms').value),
      AveBedrms: parseFloat(document.getElementById('AveBedrms').value),
      Population: parseFloat(document.getElementById('Population').value),
      AveOccup: parseFloat(document.getElementById('AveOccup').value),
      Latitude: parseFloat(document.getElementById('Latitude').value),
      Longitude: parseFloat(document.getElementById('Longitude').value)
    };
  }

  function validateForm(data) {
    const errors = [];

    for (const [field, rules] of Object.entries(VALIDATION_RULES)) {
      const val = data[field];

      if (isNaN(val) || val === null || val === undefined) {
        errors.push(`${rules.label} is required.`);
        markFieldError(field, "Required field");
        continue;
      }

      if (val < rules.min || val > rules.max) {
        errors.push(`${rules.label} must be between ${rules.min} and ${rules.max}.`);
        markFieldError(field, `Must be between ${rules.min} and ${rules.max}`);
      } else {
        clearFieldError(field);
      }
    }

    return errors;
  }

  function markFieldError(fieldId, msg) {
    const el = document.getElementById(fieldId);
    const errEl = document.getElementById(`err-${fieldId}`);
    if (el) el.classList.add('is-invalid');
    if (errEl) errEl.innerText = msg;
  }

  function clearFieldError(fieldId) {
    const el = document.getElementById(fieldId);
    const errEl = document.getElementById(`err-${fieldId}`);
    if (el) el.classList.remove('is-invalid');
    if (errEl) errEl.innerText = '';
  }

  function clearAllErrors() {
    for (const field of Object.keys(VALIDATION_RULES)) {
      clearFieldError(field);
    }
    errorAlert.classList.remove('visible');
    errorList.innerHTML = '';
  }

  function displayErrors(errorStrings, title = "Validation Error") {
    errorMessage.innerText = title;
    errorList.innerHTML = errorStrings.map(err => `<li>${err}</li>`).join('');
    errorAlert.classList.add('visible');
    errorAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function handleBackendError(status, data) {
    if (status === 422 && data.error_details) {
      const issues = data.error_details.map(e => `${e.field}: ${e.error}`);
      displayErrors(issues, data.message || "Invalid Input Data");
    } else if (data.detail && typeof data.detail === 'object') {
      displayErrors([data.detail.message || data.detail.details || "Error executing model."], "Server Error");
    } else {
      const msg = typeof data.detail === 'string' ? data.detail : (data.error || "An unexpected error occurred.");
      displayErrors([msg], "Prediction Error");
    }
  }

  function displayPredictionResult(res) {
    // Expected structure from updated main.py
    const priceFormatted = res.prediction?.estimated_price_usd || `$${(res.prediction * 100000).toLocaleString()}`;
    const bracket = res.prediction?.price_bracket || "Estimated Valuation";
    const rawVal = res.prediction?.raw_model_value ?? res.prediction;

    estimatedPriceEl.innerText = priceFormatted;
    priceBracketEl.innerText = bracket;
    resultExplanationEl.innerText = "Estimated value based on the property details provided.";

    // Fill metrics
    if (res.input_summary) {
      metricRooms.innerText = `${res.input_summary.average_rooms} rms (${res.input_summary.average_bedrooms} bd)`;
      metricIncome.innerText = res.input_summary.median_income;
      metricAge.innerText = res.input_summary.house_age;
      metricCoords.innerText = `${res.input_summary.location.latitude}, ${res.input_summary.location.longitude}`;
    }

    if (rawModelVal && rawVal !== undefined) {
      rawModelVal.innerText = `Raw Model Index: ${rawVal} ($100k units)`;
    }

    // Show result
    resultSection.classList.add('visible');
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function applyFormData(data) {
    for (const [key, val] of Object.entries(data)) {
      const el = document.getElementById(key);
      if (el) el.value = val;
    }
    updateIncomeHint(data.MedInc);
  }

  function updateIncomeHint(val) {
    if (!val || isNaN(val)) {
      incomeHint.innerText = '≈ $40,000 / yr';
      return;
    }
    const annualUsd = Math.round(parseFloat(val) * 10000);
    incomeHint.innerText = `≈ $${annualUsd.toLocaleString()} / yr`;
  }

  function setLoadingState(isLoading) {
    submitBtn.disabled = isLoading;
    if (isLoading) {
      submitBtn.classList.add('loading');
      document.getElementById('btn-text').innerText = 'Valuating Property...';
    } else {
      submitBtn.classList.remove('loading');
      document.getElementById('btn-text').innerText = 'Predict House Price';
    }
  }

  async function checkBackendHealth() {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        statusIndicator.innerHTML = `<span class="status-dot"></span> Model Ready`;
        statusIndicator.title = "Connected to FastAPI Backend";
      } else {
        statusIndicator.innerHTML = `<span class="status-dot" style="background:#f59e0b"></span> API Offline`;
      }
    } catch {
      statusIndicator.innerHTML = `<span class="status-dot" style="background:#ef4444"></span> Backend Offline`;
      statusIndicator.title = "FastAPI server not detected. Start with: uvicorn main:app --reload";
    }
  }
});
