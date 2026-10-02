# =========================================================
# STUDYMETA AI - FASTAPI BACKEND
# Authentication + SQLite + Google Gemini AI + Google Search
# =========================================================

import hashlib
import os
import time
import re
import secrets
import sqlite3
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

try:
    from ddgs import DDGS
except ImportError:
    DDGS = None

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr


# =========================================================
# PROJECT PATHS
# =========================================================

BASE_DIR = Path(__file__).resolve().parent

DATABASE_PATH = BASE_DIR / "studymetaai.db"


# =========================================================
# ENVIRONMENT VARIABLES
# =========================================================

load_dotenv(BASE_DIR / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is missing. "
        "Add GEMINI_API_KEY=your_key_here to .env"
    )


# =========================================================
# GOOGLE GEMINI CLIENT
# =========================================================

ai_client = genai.Client(
    api_key=GEMINI_API_KEY
)


# =========================================================
# FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="StudyMetaAI API",

    description=(
        "Backend for the StudyMetaAI "
        "learning assistant."
    ),

    version="3.1.0",
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "https://nikilkumar-yadav.github.io",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
)


# =========================================================
# DATABASE CONNECTION
# =========================================================

def get_connection():

    connection = sqlite3.connect(
        DATABASE_PATH
    )

    connection.row_factory = sqlite3.Row

    return connection


# =========================================================
# CREATE DATABASE
# =========================================================

def create_database():

    with get_connection() as connection:

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                full_name TEXT NOT NULL,

                email TEXT NOT NULL UNIQUE,

                password TEXT NOT NULL,

                salt TEXT NOT NULL

            )
            """
        )

        connection.commit()


create_database()


# =========================================================
# PASSWORD HASHING
# =========================================================

def hash_password(
    password: str,
    salt: str
) -> str:

    return hashlib.pbkdf2_hmac(
        "sha256",

        password.encode("utf-8"),

        salt.encode("utf-8"),

        100_000,
    ).hex()


# =========================================================
# PYDANTIC MODELS
# =========================================================

class SignupRequest(BaseModel):

    full_name: str

    email: EmailStr

    password: str

    confirm_password: str


class LoginRequest(BaseModel):

    email: EmailStr

    password: str


class ChatRequest(BaseModel):

    message: str


# =========================================================
# FRONTEND PAGE ROUTES
# =========================================================

@app.get("/")
@app.get("/login")
@app.get("/login.html")
async def login_page():

    return FileResponse(
        BASE_DIR / "login.html"
    )


@app.get("/signup")
@app.get("/signup.html")
async def signup_page():

    return FileResponse(
        BASE_DIR / "signup.html"
    )


@app.get("/chat")
@app.get("/chat.html")
async def chat_page():

    return FileResponse(
        BASE_DIR / "chat.html"
    )


# =========================================================
# FRONTEND STATIC FILE ROUTES
# =========================================================

@app.get("/style.css")
async def style_css():

    return FileResponse(
        BASE_DIR / "style.css",
        media_type="text/css"
    )


@app.get("/script.js")
async def script_js():

    return FileResponse(
        BASE_DIR / "script.js",
        media_type="application/javascript"
    )


# =========================================================
# SIGNUP API
# =========================================================

@app.post("/api/signup")
async def signup(
    request: SignupRequest
):

    # -----------------------------------------
    # Clean input
    # -----------------------------------------

    full_name = request.full_name.strip()

    email = (
        str(request.email)
        .lower()
        .strip()
    )


    # -----------------------------------------
    # Validation
    # -----------------------------------------

    if len(full_name) < 2:

        raise HTTPException(
            status_code=400,

            detail=(
                "Please enter a valid "
                "full name."
            )
        )


    if len(request.password) < 6:

        raise HTTPException(
            status_code=400,

            detail=(
                "Password must contain "
                "at least 6 characters."
            )
        )


    if (
        request.password
        != request.confirm_password
    ):

        raise HTTPException(
            status_code=400,

            detail="Passwords do not match."
        )


    # -----------------------------------------
    # Generate password salt
    # -----------------------------------------

    salt = secrets.token_hex(16)


    password_hash = hash_password(
        request.password,
        salt
    )


    # -----------------------------------------
    # Save user
    # -----------------------------------------

    try:

        with get_connection() as connection:

            connection.execute(
                """
                INSERT INTO users
                (
                    full_name,
                    email,
                    password,
                    salt
                )

                VALUES (?, ?, ?, ?)
                """,

                (
                    full_name,
                    email,
                    password_hash,
                    salt,
                ),
            )

            connection.commit()


    except sqlite3.IntegrityError:

        raise HTTPException(
            status_code=400,

            detail=(
                "An account with this "
                "email already exists."
            )
        )


    # -----------------------------------------
    # Success
    # -----------------------------------------

    return {

        "success": True,

        "message": (
            "Account created successfully. "
            "Please login."
        ),
    }


# =========================================================
# LOGIN API
# =========================================================

@app.post("/api/login")
async def login(
    request: LoginRequest
):

    email = (
        str(request.email)
        .lower()
        .strip()
    )


    # -----------------------------------------
    # Find user
    # -----------------------------------------

    with get_connection() as connection:

        user = connection.execute(
            """
            SELECT *
            FROM users
            WHERE email = ?
            """,

            (email,),
        ).fetchone()


    # -----------------------------------------
    # User doesn't exist
    # -----------------------------------------

    if not user:

        raise HTTPException(
            status_code=401,

            detail=(
                "Invalid email or password."
            )
        )


    # -----------------------------------------
    # Hash entered password
    # -----------------------------------------

    entered_hash = hash_password(
        request.password,

        user["salt"]
    )


    # -----------------------------------------
    # Compare password
    # -----------------------------------------

    if not secrets.compare_digest(
        entered_hash,

        user["password"]
    ):

        raise HTTPException(
            status_code=401,

            detail=(
                "Invalid email or password."
            )
        )


    # -----------------------------------------
    # Login success
    # -----------------------------------------

    return {

        "success": True,

        "message": "Login successful.",

        "user": {

            "id": user["id"],

            "full_name":
                user["full_name"],

            "email":
                user["email"],
        },
    }


# =========================================================
# AI CHAT API
# =========================================================

@app.post("/api/chat")
async def chat_api(
    request: ChatRequest
):

    user_message = (
        request.message.strip()
    )


    # =====================================================
    # VALIDATE MESSAGE
    # =====================================================

    if not user_message:

        raise HTTPException(
            status_code=400,

            detail=(
                "Please enter a message."
            )
        )


    if len(user_message) > 8000:

        raise HTTPException(
            status_code=400,

            detail=(
                "Message is too long. "
                "Keep it under 8000 characters."
            )
        )


    # =====================================================
    # STUDYMETA AI SYSTEM PROMPT
    # =====================================================

    system_prompt = """

You are StudyMetaAI, a professional AI
study assistant.

Your main purpose is to help students learn,
understand concepts, solve problems, write code,
prepare for exams and build projects.

=================================================
GENERAL BEHAVIOR
=================================================

- Be accurate.
- Be clear.
- Be professional.
- Be friendly.
- Explain difficult topics in simple language.
- Use headings when useful.
- Use bullet points when useful.
- Give examples when useful.
- Give step-by-step explanations.
- Keep answers relevant to the question.
- Do not invent information.
- Do not knowingly provide false information.
- If you are uncertain about an important fact,
  verify it when possible.

=================================================
CURRENT INFORMATION
=================================================

For information that may have changed recently,
use browser search.

Examples:

- current
- currently
- latest
- today
- now
- recent
- this week
- this month
- this year
- news
- current president
- current prime minister
- current chief minister
- current CEO
- current price
- current version
- latest version
- latest technology
- current weather
- recent events
- election results
- current laws
- current policies
- current rankings
- current statistics

When browser search is available:

1. Search for current information.
2. Prefer reliable sources.
3. Prefer official government sources
   for government information.
4. Prefer official company sources
   for company information.
5. Prefer official documentation
   for software and programming information.
6. Do not rely only on old model knowledge.
7. If sources disagree, explain the disagreement.
8. Do not invent an answer when information
   cannot be verified.

=================================================
PROGRAMMING
=================================================

For programming questions:

- Give correct code.
- Make code runnable.
- Explain important parts.
- Use the language requested by the user.
- Do not invent libraries or functions.
- When a calculation can be verified,
  verify it instead of guessing.

=================================================
ACADEMIC QUESTIONS
=================================================

For normal academic questions that do not
require current information, answer directly.

Examples:

- Explain Python loops.
- What is a variable?
- Explain Newton's laws.
- What is a database?
- Explain recursion.
- Write a C factorial program.

=================================================
ANSWER QUALITY
=================================================

Always prioritize correctness over confidence.

Never pretend that you searched the web if
you did not.

Never claim that information is current
unless it has been verified.

If current information cannot be verified,
say that clearly.

"""


    # =====================================================
    # REAL-TIME WEB SEARCH + GEMINI AI ROUTER
    # =====================================================

    try:
        lower_message = user_message.lower().strip()

        current_keywords = [
            "current", "currently", "latest", "today", "now", "recent",
            "recently", "news", "this week", "this month", "this year",
            "prime minister", "president", "chief minister", "ceo",
            "mayor", "minister", "current price", "latest price",
            "price today", "current version", "latest version",
            "weather", "election", "elections", "election result",
            "result", "results", "ranking", "rankings", "stock", "stocks",
            "score", "scores", "who won", "released", "release",
            "updated", "update", "what happened", "developments",
            "live", "as of today", "as of now", "this morning",
            "this afternoon", "tonight"
        ]

        current_question_patterns = [
            r"\bwho\s+is\s+(the\s+)?(prime minister|president|chief minister|mayor|ceo|minister)\b",
            r"\bwhat\s+is\s+the\s+(current\s+)?price\b",
            r"\bhow\s+much\s+does\s+.*\s+cost\s+(today|now)\b",
            r"\bwhich\s+version\s+is\s+(current|latest)\b",
            r"\bwhat\s+is\s+the\s+latest\b",
            r"\bwhat\s+happened\s+in\b",
            r"\bwho\s+won\b",
        ]

        needs_search = (
            any(k in lower_message for k in current_keywords)
            or any(re.search(pattern, lower_message) for pattern in current_question_patterns)
        )

        # -----------------------------------------------------
        # LOCAL ARITHMETIC
        # -----------------------------------------------------
        import ast
        import operator

        def safe_calculate(expression: str):
            expression = (
                expression.replace("×", "*")
                .replace("÷", "/")
                .replace("−", "-")
                .replace("–", "-")
                .replace("^", "**")
            )

            allowed = set("0123456789.+-*/%() \t\n")
            if not expression or any(ch not in allowed for ch in expression):
                return None

            try:
                tree = ast.parse(expression, mode="eval")

                binary_ops = {
                    ast.Add: operator.add,
                    ast.Sub: operator.sub,
                    ast.Mult: operator.mul,
                    ast.Div: operator.truediv,
                    ast.FloorDiv: operator.floordiv,
                    ast.Mod: operator.mod,
                    ast.Pow: operator.pow,
                }

                unary_ops = {
                    ast.UAdd: operator.pos,
                    ast.USub: operator.neg,
                }

                def evaluate(node):
                    if isinstance(node, ast.Expression):
                        return evaluate(node.body)

                    if isinstance(node, ast.Constant) and isinstance(
                        node.value, (int, float)
                    ):
                        return node.value

                    if isinstance(node, ast.BinOp) and type(node.op) in binary_ops:
                        left = evaluate(node.left)
                        right = evaluate(node.right)

                        if isinstance(node.op, ast.Pow) and abs(right) > 100:
                            raise ValueError("Exponent too large")

                        result = binary_ops[type(node.op)](left, right)

                        if isinstance(result, (int, float)) and abs(result) > 1e100:
                            raise ValueError("Result too large")

                        return result

                    if isinstance(node, ast.UnaryOp) and type(node.op) in unary_ops:
                        return unary_ops[type(node.op)](evaluate(node.operand))

                    raise ValueError("Unsupported expression")

                return evaluate(tree)

            except Exception:
                return None

        arithmetic_match = re.search(
            r"(?<![\w.])"
            r"(\d+(?:\.\d+)?(?:\s*[+\-*/%×÷^]\s*"
            r"\d+(?:\.\d+)?)+)"
            r"(?![\w.])",
            user_message,
        )

        if arithmetic_match and not needs_search:
            expression = arithmetic_match.group(1)
            result = safe_calculate(expression)

            if result is not None:
                if isinstance(result, float) and result.is_integer():
                    display_result = int(result)
                else:
                    display_result = result

                return {
                    "success": True,
                    "answer": (
                        f"### Result\n\n"
                        f"`{expression}` = **{display_result}**"
                    ),
                    "searched": False,
                    "model": "local-calculator",
                    "sources": [],
                }

        # -----------------------------------------------------
        # REAL-TIME DDGS SEARCH
        # -----------------------------------------------------
        web_context = ""
        sources = []

        if needs_search:
            if DDGS is None:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Real-time search is unavailable because the "
                        "ddgs package is not installed. Run: "
                        "py -m pip install -U ddgs"
                    ),
                )

            print("StudyMetaAI: live search required")
            print(f"StudyMetaAI: searching web for: {user_message}")

            try:
              search_results = list(
    DDGS(timeout=10).text(
        user_message,
        region="in-en",
        safesearch="moderate",
        max_results=8,
        backend="google,brave,bing,duckduckgo,yahoo",
    )

            except Exception as search_error:
                print(
                    f"StudyMetaAI: DDGS live search failed: {search_error}"
                )
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Live web search is temporarily unavailable. "
                        "StudyMetaAI will not answer this current-information "
                        "question from old model knowledge."
                    ),
                )

            for item in search_results:
                title = str(item.get("title", "")).strip()
                href = str(item.get("href", "")).strip()
                body = str(item.get("body", "")).strip()

                if not title and not body:
                    continue

                sources.append({
                    "title": title or "Web result",
                    "url": href,
                    "snippet": body,
                })

            if not sources:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Live web search returned no usable results. "
                        "Please try the question again."
                    ),
                )

            web_context = "\n\n".join(
                f"[SOURCE {i}]\n"
                f"Title: {source['title']}\n"
                f"URL: {source['url']}\n"
                f"Content: {source['snippet']}"
                for i, source in enumerate(sources, start=1)
            )

            print(
                f"StudyMetaAI: DDGS returned {len(sources)} live sources"
            )

        # -----------------------------------------------------
        # GEMINI MODEL CONFIGURATION
        # -----------------------------------------------------
        models_to_try = [
            "gemini-3.8-flash",
            "gemini-3.7-flash",
            "gemini-3.6-flash",
            "gemini-3.5-flash",
            "gemini-3.5-flash-lite",
        ]

        base_config_kwargs = {
            "system_instruction": system_prompt,
            "max_output_tokens": 4096,
            "thinking_config": types.ThinkingConfig(
                thinking_level="low"
            ),
        }

        plain_config = types.GenerateContentConfig(
            **base_config_kwargs
        )

        if needs_search:
            contents = f"""
USER QUESTION:
{user_message}

LIVE WEB SEARCH RESULTS:
{web_context}

INSTRUCTIONS:
- Answer using the LIVE WEB SEARCH RESULTS above.
- Do not substitute old model knowledge for missing current facts.
- Prefer official or primary sources when present.
- If sources disagree, clearly say so.
- Do not claim that you personally browsed Google.
- Do not invent facts unsupported by the supplied results.
"""
        else:
            contents = user_message

        last_error = None

        # -----------------------------------------------------
        # GEMINI SYNTHESIS
        # -----------------------------------------------------
        for model_name in models_to_try:
            print(f"StudyMetaAI: trying {model_name}")

            try:
                response = ai_client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=plain_config,
                )

                if response and response.text:
                    print(f"StudyMetaAI: answered using {model_name}")

                    return {
                        "success": True,
                        "answer": response.text.strip(),
                        "searched": needs_search,
                        "model": model_name,
                        "sources": sources,
                    }

                last_error = RuntimeError(
                    f"{model_name} returned an empty response."
                )

            except Exception as error:
                last_error = error
                error_text = str(error).upper()

                print(
                    f"StudyMetaAI: {model_name} request failed: {error}"
                )

                transient_or_quota = any(
                    code in error_text
                    for code in (
                        "408", "429", "500", "502", "503", "504",
                        "TIMEOUT", "UNAVAILABLE", "RESOURCE_EXHAUSTED",
                        "OVERLOADED", "RATE LIMIT", "RATE_LIMIT", "QUOTA"
                    )
                )

                if transient_or_quota:
                    print(
                        f"StudyMetaAI: {model_name} unavailable/rate-limited; "
                        "trying the next model..."
                    )
                    continue

                break

        raise last_error or RuntimeError(
            "No configured Gemini model returned an answer."
        )

    except HTTPException:
        raise

    except Exception as error:
        print()
        print("========================================")
        print("STUDYMETA AI - GEMINI ERROR")
        print("========================================")
        print(repr(error))
        print("========================================")
        print()

        error_text = str(error).lower()

        if (
            "429" in error_text
            or "resource_exhausted" in error_text
            or "rate limit" in error_text
            or "quota" in error_text
        ):
            detail = (
                "Gemini API quota/rate limit was reached. "
                "Simple calculations are handled locally, but this "
                "question needs Gemini. Please wait for the quota window "
                "to reset or check your Gemini API usage limits."
            )

        elif (
            "503" in error_text
            or "unavailable" in error_text
            or "overloaded" in error_text
        ):
            detail = (
                "Gemini is temporarily unavailable. "
                "StudyMetaAI tried the available fallback models."
            )

        elif "blocked" in error_text or "safety" in error_text:
            detail = (
                "Gemini blocked this request or response because of its "
                "safety system."
            )

        elif (
            "api key" in error_text
            or "authentication" in error_text
            or "permission" in error_text
        ):
            detail = (
                "The Gemini API key or project permissions need to be checked."
            )

        else:
            detail = (
                "StudyMetaAI could not generate the answer. "
                "Check the server terminal for the exact Gemini error."
            )

        raise HTTPException(status_code=500, detail=detail)


# =====================================================
    # HEALTH CHECK
# =========================================================

@app.get("/api/health")
async def health():

    return {
        "status": "online",
        "application": "StudyMetaAI",
        "ai_provider": "Google Gemini",
        "model": "Gemini 3.8 Flash with automatic model fallback",
        "features": [
            "AI Chat",
            "Real-Time DDGS Web Search",
            "Fresh Search Results + Gemini Synthesis",
            "Local Arithmetic",
            "Automatic Model Fallback",
            "SQLite Authentication"
        ],
        "message": "StudyMetaAI backend is running successfully.",
    }



# =========================================================
# RUN SERVER
# =========================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(

        "main:app",

        host="127.0.0.1",

        port=8000,

        reload=True
    )
