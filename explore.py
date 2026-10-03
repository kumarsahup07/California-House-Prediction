from sklearn.datasets import fetch_california_housing
import pandas as pd

data = fetch_california_housing()

df = pd.DataFrame(data.data,columns=data.feature_names)

df['Price'] = data.target
print("Shape",df.shape)
print("Columns",df.columns)
print("Head",df.head())