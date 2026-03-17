import google.generativeai as genai
import os
from dotenv import load_dotenv
from typing import AsyncGenerator

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

FLASH = "gemini-2.5-flash"
PRO   = "gemini-2.5-flash"


def get_model(model_name: str = FLASH) -> genai.GenerativeModel:
    return genai.GenerativeModel(model_name)


async def stream_generate(
    prompt: str,
    system: str = "",
    temperature: float = 0.7,
    model_name: str = FLASH,
) -> AsyncGenerator[str, None]:
    model = genai.GenerativeModel(
        model_name,
        system_instruction=system if system else None,
        generation_config=genai.GenerationConfig(temperature=temperature),
    )
    response = model.generate_content(prompt, stream=True)
    for chunk in response:
        if chunk.text:
            yield chunk.text


async def generate(
    prompt: str,
    system: str = "",
    temperature: float = 0.4,
    model_name: str = FLASH,
) -> str:
    model = genai.GenerativeModel(
        model_name,
        system_instruction=system if system else None,
        generation_config=genai.GenerationConfig(temperature=temperature),
    )
    response = model.generate_content(prompt)
    return response.text
