# Global & typography styles
BASE_CSS = """
/* ── Global ── */
.stApp { background: #0B0E1A; }
.stApp header { background: #0B0E1A !important; border-bottom: 1px solid #1E293B; }

/* ── Typography ── */
h1, h2, h3, h4, h5, h6 {
    color: #E2E8F0;
    font-weight: 600;
    letter-spacing: -0.02em;
}
h1 { font-size: 2.2rem !important; }
p, li, .stMarkdown {
    color: #CBD5E1;
}

/* ── Divider ── */
hr {
    border: none;
    height: 1px;
    background: linear-gradient(90deg, transparent, #1E293B, transparent);
    margin: 1.5rem 0;
}

/* ── Scrollbar ── */
::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
::-webkit-scrollbar-track {
    background: #0B0E1A;
}
::-webkit-scrollbar-thumb {
    background: #1E293B;
    border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
    background: #3B82F6;
}

/* ── Caption / small text ── */
.stCaption, .stMarkdown small, .stMarkdown .caption {
    color: #64748B;
}

/* ── Code blocks ── */
code {
    background: #1A1F2E !important;
    color: #60A5FA !important;
    border: 1px solid #1E293B;
    border-radius: 6px;
    padding: 0.15em 0.4em;
}
pre code {
    background: #0F1423 !important;
    border: 1px solid #1E293B;
    color: #CBD5E1 !important;
}
"""