from pathlib import Path
import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

app = FastAPI(
    title="California House Price Prediction API",
    description="Predict California house prices using a trained Random Forest model with easy-to-read results and clear error messages.",
    version="1.0.0"
)

# Enable CORS for local development and frontend clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model and feature names relative to this file
BASE_DIR = Path(__file__).resolve().parent
model = joblib.load(BASE_DIR / "house_model.joblib")
features = joblib.load(BASE_DIR / "house_features.joblib")

# Mount static directory for frontend
STATIC_DIR = BASE_DIR / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")



# Helper function to categorize prices
def get_price_bracket(price_usd: float) -> str:
    if price_usd < 150000:
        return "Affordable (< $150,000)"
    elif price_usd < 300000:
        return "Moderate ($150,000 - $300,000)"
    elif price_usd < 450000:
        return "High ($300,000 - $450,000)"
    else:
        return "Luxury / Premium ($450,000+)"


# Custom validation error handler for human-readable error messages
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        field_name = " -> ".join(str(loc) for loc in err["loc"] if loc != "body")
        errors.append({
            "field": field_name,
            "error": err["msg"],
            "value_received": err.get("input")
        })

    return JSONResponse(
        status_code=422,
        content={
            "status": "error",
            "error_type": "Invalid Input Data",
            "message": "One or more input values are missing or out of valid range.",
            "total_errors": len(errors),
            "error_details": errors,
            "hint": "Use GET /predict/example to see a valid input format and value ranges."
        }
    )


# Input schema with clear field descriptions and ranges
class HouseFeatures(BaseModel):
    MedInc: float = Field(..., ge=0.5, le=15.0, description="Median income in $10k (0.5 to 15.0, e.g. 4.05 = $40,500)")
    HouseAge: float = Field(..., ge=1, le=52, description="Median house age (1 to 52 years)")
    AveRooms: float = Field(..., ge=1.0, le=15.0, description="Average rooms per home (1.0 to 15.0)")
    AveBedrms: float = Field(..., ge=0.5, le=4.0, description="Average bedrooms per home (0.5 to 4.0)")
    Population: float = Field(..., ge=100, le=35000, description="Block population (100 to 35,000)")
    AveOccup: float = Field(..., ge=1.0, le=15.0, description="Average household members (1.0 to 15.0)")
    Latitude: float = Field(..., ge=32.0, le=42.0, description="Latitude (California range: 32.0 to 42.0)")
    Longitude: float = Field(..., ge=-125.0, le=-114.0, description="Longitude (California range: -125.0 to -114.0)")


@app.get("/")
def home():
    return {
        "message": "Welcome to California House Price Prediction API",
        "status": "running",
        "endpoints": {
            "GET /": "API overview",
            "GET /ui": "Interactive Web UI",
            "GET /health": "Model health and status",
            "GET /predict/example": "Sample valid payload to try",
            "POST /predict": "Submit features and receive predicted house price"
        }
    }


@app.get("/ui", include_in_schema=False)
@app.get("/app", include_in_schema=False)
def serve_ui():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="Frontend UI file not found. Ensure static/index.html exists.")


@app.get("/styles.css", include_in_schema=False)
def serve_css():
    return FileResponse(STATIC_DIR / "styles.css")


@app.get("/app.js", include_in_schema=False)
def serve_js():
    return FileResponse(STATIC_DIR / "app.js")


@app.get("/bg.jpg", include_in_schema=False)
def serve_bg():
    return FileResponse(STATIC_DIR / "bg.jpg")




@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": True,
        "model_name": "RandomForestRegressor",
        "model_version": "1.0.0",
        "expected_features": features
    }


@app.post("/predict")
def predict(house: HouseFeatures):
    try:
        # Convert Pydantic model to dictionary (compatible with Pydantic v1 & v2)
        data_dict = house.model_dump() if hasattr(house, "model_dump") else house.dict()

        # Create DataFrame and ensure feature column ordering
        data = pd.DataFrame([data_dict])[features]

        # Make prediction
        raw_prediction = float(model.predict(data)[0])

        # California Housing dataset target is in $100,000 units
        estimated_price_usd = round(raw_prediction * 100000, 2)

        return {
            "status": "success",
            "prediction": {
                "estimated_price_usd": f"${estimated_price_usd:,.2f}",
                "estimated_price_number": estimated_price_usd,
                "raw_model_value": round(raw_prediction, 4),
                "price_bracket": get_price_bracket(estimated_price_usd)
            },
            "input_summary": {
                "median_income": f"${(house.MedInc * 10000):,.0f} / year",
                "house_age": f"{int(house.HouseAge)} years",
                "average_rooms": house.AveRooms,
                "average_bedrooms": house.AveBedrms,
                "block_population": int(house.Population),
                "average_occupancy": f"{house.AveOccup} people/house",
                "location": {
                    "latitude": house.Latitude,
                    "longitude": house.Longitude
                }
            },
            "raw_input": data_dict
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "error_type": "Internal Server Error",
                "message": "An error occurred while calculating the prediction.",
                "details": str(e)
            }
        )


@app.get("/predict/example")
def get_example_request():
    """Returns a realistic, valid sample payload that can be copied directly into /predict."""
    return HouseFeatures(
        MedInc=4.0583,
        HouseAge=41.0,
        AveRooms=5.818,
        AveBedrms=1.038,
        Population=1127.0,
        AveOccup=2.6,
        Latitude=37.88,
        Longitude=-122.23
    )


