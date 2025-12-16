# Troubleshooting

## Web dev server starts but API calls fail

- Confirm API is running on `http://localhost:8000`
- Check the API terminal for errors

## Verify fails on web tests

- Run web tests directly: `npm --workspace apps/web run test`

## Verify fails on API tests

- Ensure the API venv exists: `apps/api/.venv`
- Run API tests directly: `apps/api/.venv/Scripts/python.exe -m pytest`
