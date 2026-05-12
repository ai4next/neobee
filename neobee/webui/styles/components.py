# Widget & component styles
COMPONENTS_CSS = """
/* ── Sidebar ── */
section[data-testid="stSidebar"] {
    background: #0F1423;
    border-right: 1px solid #1E293B;
}
section[data-testid="stSidebar"] .stButton button[kind="primary"] {
    background: #1E293B;
    border: 1px solid #334155;
    color: #E2E8F0;
    font-weight: 500;
    transition: all 0.2s ease;
}
section[data-testid="stSidebar"] .stButton button[kind="primary"]:hover {
    border-color: #475569;
    background: #273548;
}
section[data-testid="stSidebar"] .stButton button[kind="secondary"] {
    background: transparent;
    border: 1px solid #1E293B;
    color: #64748B;
    transition: all 0.2s ease;
}
section[data-testid="stSidebar"] .stButton button[kind="secondary"]:hover {
    border-color: #475569;
    color: #CBD5E1;
    background: #1A1F2E;
}
section[data-testid="stSidebar"] .stButton button[kind="secondary"][data-testid="baseButton-secondary"]:focus-visible {
    outline: none;
}

/* ── Sidebar title ── */
section[data-testid="stSidebar"] h1, section[data-testid="stSidebar"] h2 {
    color: #E2E8F0;
}

/* ── Main content cards ── */
div[data-testid="stContainerWithBorder"] {
    background: #1A1F2E !important;
    border: 1px solid #1E293B !important;
    border-radius: 12px;
    padding: 1.25rem;
    transition: all 0.3s ease;
}
div[data-testid="stContainerWithBorder"]:hover {
    border-color: #334155 !important;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

/* ── Tabs ── */
.stTabs [data-baseweb="tab-list"] {
    gap: 0;
    background: transparent;
    border-bottom: 1px solid #1E293B;
}
.stTabs [data-baseweb="tab"] {
    color: #64748B;
    font-weight: 500;
    transition: all 0.3s ease;
    padding: 0.75rem 1.25rem;
}
.stTabs [data-baseweb="tab"]:hover {
    color: #60A5FA;
}
.stTabs [aria-selected="true"] {
    color: #60A5FA !important;
    background: linear-gradient(180deg, rgba(96, 165, 250, 0.08) 0%, transparent 100%);
}
.stTabs [aria-selected="true"]::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0.5rem;
    right: 0.5rem;
    height: 2px;
    background: #3B82F6;
    border-radius: 2px;
}

/* ── Buttons (main area) ── */
.stButton button[kind="primary"] {
    background: #2563EB;
    border: none;
    color: #fff;
    font-weight: 500;
    transition: all 0.2s ease;
}
.stButton button[kind="primary"]:hover {
    background: #3B82F6;
}
.stButton button[kind="secondary"] {
    background: transparent;
    border: 1px solid #334155;
    color: #CBD5E1;
    transition: all 0.2s ease;
}
.stButton button[kind="secondary"]:hover {
    border-color: #475569;
    background: #1A1F2E;
}

/* ── Progress bar ── */
.stProgress > div > div > div > div {
    background: #3B82F6 !important;
    border-radius: 4px;
}
.stProgress > div > div {
    background: #1E293B;
    border-radius: 4px;
    overflow: hidden;
}

/* ── Expander ── */
details {
    background: #131827;
    border: 1px solid #1E293B;
    border-radius: 10px;
    margin: 0.5rem 0;
    transition: border-color 0.3s ease;
}
details:hover {
    border-color: #334155;
}
details summary {
    color: #94A3B8;
    font-weight: 500;
    padding: 0.5rem 0;
}

/* ── Metric ── */
div[data-testid="metric-container"] {
    background: #131827;
    border: 1px solid #1E293B;
    border-radius: 10px;
    padding: 1rem;
    transition: all 0.3s ease;
}
div[data-testid="metric-container"]:hover {
    border-color: #3B82F6;
    box-shadow: 0 0 20px rgba(59, 130, 246, 0.06);
}
div[data-testid="metric-container"] label {
    color: #64748B !important;
    font-weight: 500;
}
div[data-testid="metric-container"] div[data-testid="metric-value"] {
    color: #60A5FA !important;
    font-weight: 700;
}

/* ── Form ── */
div[data-testid="stForm"] {
    background: #131827;
    border: 1px solid #1E293B;
    border-radius: 12px;
    padding: 1.5rem;
}
div[data-testid="stForm"] input, div[data-testid="stForm"] textarea, div[data-testid="stForm"] select {
    background: #0B0E1A !important;
    border: 1px solid #1E293B !important;
    color: #F1F5F9 !important;
    border-radius: 8px;
    transition: border-color 0.3s ease;
}
div[data-testid="stForm"] input:focus, div[data-testid="stForm"] textarea:focus {
    border-color: #3B82F6 !important;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15) !important;
}
div[data-testid="stForm"] label {
    color: #94A3B8 !important;
    font-weight: 500;
}

/* ── Input widgets (outside forms) ── */
.stTextInput input, .stTextArea textarea, .stSelectbox div[data-baseweb="select"] > div {
    background: #0B0E1A !important;
    border: 1px solid #1E293B !important;
    color: #F1F5F9 !important;
    border-radius: 8px;
    transition: border-color 0.3s ease;
}
.stTextInput input:focus, .stTextArea textarea:focus {
    border-color: #3B82F6 !important;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15) !important;
}

/* ── Number input ── */
.stNumberInput input {
    background: #0B0E1A !important;
    border: 1px solid #1E293B !important;
    color: #F1F5F9 !important;
    border-radius: 8px;
}
.stNumberInput button {
    background: #1A1F2E !important;
    border: 1px solid #1E293B !important;
    color: #94A3B8 !important;
}
.stNumberInput button:hover {
    border-color: #3B82F6 !important;
    color: #3B82F6 !important;
}

/* ── Info / Success / Warning / Error boxes ── */
.stAlert {
    border-radius: 10px;
    border: 1px solid;
}
.stAlert.st-info {
    background: rgba(59, 130, 246, 0.08);
    border-color: rgba(59, 130, 246, 0.3);
    color: #93C5FD;
}
.stAlert.st-success {
    background: rgba(16, 185, 129, 0.08);
    border-color: rgba(16, 185, 129, 0.3);
    color: #6EE7B7;
}
.stAlert.st-warning {
    background: rgba(245, 158, 11, 0.08);
    border-color: rgba(245, 158, 11, 0.3);
    color: #FCD34D;
}
.stAlert.st-error {
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.3);
    color: #FCA5A5;
}

/* ── DataFrame ── */
div[data-testid="stDataFrame"] {
    background: #131827;
}
div[data-testid="stDataFrame"] th {
    background: #1A1F2E !important;
    color: #94A3B8 !important;
    font-weight: 600;
    border-bottom: 1px solid #1E293B;
}
div[data-testid="stDataFrame"] td {
    color: #CBD5E1 !important;
    background: #0F1423 !important;
    border-bottom: 1px solid #1E293B;
}
div[data-testid="stDataFrame"] tr:hover td {
    background: #1A1F2E !important;
}

/* ── Select box dropdown ── */
div[data-baseweb="select"] ul {
    background: #131827 !important;
    border: 1px solid #1E293B !important;
}
div[data-baseweb="select"] li:hover {
    background: #1A1F2E !important;
}

/* ── Checkbox / Radio ── */
.stCheckbox label, .stRadio label {
    color: #CBD5E1 !important;
}

/* ── Tooltip ── */
div[data-baseweb="tooltip"] {
    background: #1A1F2E !important;
    border: 1px solid #1E293B !important;
    color: #CBD5E1 !important;
}
"""