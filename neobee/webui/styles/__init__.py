from __future__ import annotations

import streamlit as st

from neobee.webui.styles.base import BASE_CSS
from neobee.webui.styles.components import COMPONENTS_CSS


def inject_theme() -> None:
    css = BASE_CSS + "\n" + COMPONENTS_CSS
    st.markdown(f"<style>{css}</style>", unsafe_allow_html=True)