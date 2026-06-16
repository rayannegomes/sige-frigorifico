from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from pydantic import BaseModel
from jose import jwt
from dotenv import load_dotenv
import os

load_dotenv()
router = APIRouter()

class LoginData(BaseModel):
    email: str
    senha: str

@router.post("/login")
def login(dados: LoginData, db: Session = Depends(get_db)):
    resultado = db.execute(
        text("SELECT * FROM usuarios WHERE email = :email AND senha_hash = :senha"),
        {"email": dados.email, "senha": dados.senha}
    ).fetchone()

    if not resultado:
        raise HTTPException(401, "Credenciais inválidas")

    token = jwt.encode(
        {"sub": str(resultado[0]), "email": resultado[2], "perfil": resultado[4]},
        os.getenv("SECRET_KEY"),
        algorithm=os.getenv("ALGORITHM")
    )
    return {
        "token": token,
        "nome": resultado[1],
        "perfil": resultado[4]
    }