# Global & typography styles
BASE_CSS = """
/* ── Global ── */
.stApp { background: #08111F; }
.stApp header { background: #08111F !important; border-bottom: 1px solid #1F2937; }

/* ── Typography ── */
h1, h2, h3, h4, h5, h6 {
    color: #F7FAFC;
    font-weight: 600;
    letter-spacing: -0.02em;
}
h1 { font-size: 2.2rem !important; }
p, li, .stMarkdown {
    color: #E5E7EB;
}

/* ── Divider ── */
hr {
    border: none;
    height: 1px;
    background: linear-gradient(90deg, transparent, #1F2937, transparent);
    margin: 1.5rem 0;
}

/* ── Scrollbar ── */
::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}
::-webkit-scrollbar-track {
    background: #08111F;
}
::-webkit-scrollbar-thumb {
    background: #1F2937;
    border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
    background: #38BDF8;
}

/* ── Caption / small text ── */
.stCaption, .stMarkdown small, .stMarkdown .caption {
    color: #94A3B8;
}

/* ── Code blocks ── */
code {
    background: #1F2937 !important;
    color: #38BDF8 !important;
    border: 1px solid #1F2937;
    border-radius: 6px;
    padding: 0.15em 0.4em;
}
pre code {
    background: #0D1B2A !important;
    border: 1px solid #1F2937;
    color: #E5E7EB !important;
}
"""