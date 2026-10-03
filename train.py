from sklearn.datasets import fetch_california_housing
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error,r2_score

import pandas as pd
import joblib

print("loading dataset")
data = fetch_california_housing()
X = pd.DataFrame(data.data,columns=data.feature_names)
y = data.target
print("total records: ",X.shape[0])
print('-'*20)


print("Splitting dataset")
X_train,X_test,y_train,y_test = train_test_split(X,y,test_size=0.2,random_state=42)
print("Train shape: ",X_train.shape)
print("Test shape: ",X_test.shape)
print('-'*20)

print("Training Random Forest Model")
model = RandomForestRegressor(n_estimators=100,random_state=42,n_jobs=-1)
model.fit(X_train,y_train)
print("Model trained")
print('-'*20)


print("Evaluating model")
y_pred = model.predict(X_test)
mae = mean_absolute_error(y_test,y_pred)
r2 = r2_score(y_test,y_pred)
print("MAE: ",mae)
print("R2 Score: ",r2)
print(f"avg error {(mae*1000):,.0f} dollars")
print('-'*20)


print("Saving model")
joblib.dump(model,"house_model.joblib")
joblib.dump(list(X.columns),"house_features.joblib")
print("Model saved successfully")