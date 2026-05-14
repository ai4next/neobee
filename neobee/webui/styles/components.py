# Widget & component styles
COMPONENTS_CSS = """
/* ── Sidebar ── */
section[data-testid="stSidebar"] {
    background: #0D1B2A;
    border-right: 1px solid #1F2937;
}
section[data-testid="stSidebar"] .stButton button[kind="primary"] {
    background: #1F2937;
    border: 1px solid #1F2937;
    color: #F7FAFC;
    font-weight: 500;
    transition: all 0.2s ease;
}
section[data-testid="stSidebar"] .stButton button[kind="primary"]:hover {
    border-color: #94A3B8;
    background: #1F2937;
}
section[data-testid="stSidebar"] .stButton button[kind="secondary"] {
    background: transparent;
    border: 1px solid #1F2937;
    color: #94A3B8;
    transition: all 0.2s ease;
}
section[data-testid="stSidebar"] .stButton button[kind="secondary"]:hover {
    border-color: #94A3B8;
    color: #E5E7EB;
    background: #1F2937;
}
section[data-testid="stSidebar"] .stButton button[kind="secondary"][data-testid="baseButton-secondary"]:focus-visible {
    outline: none;
}

/* ── Sidebar title ── */
section[data-testid="stSidebar"] h1, section[data-testid="stSidebar"] h2 {
    color: #F7FAFC;
}

/* ── Main content cards ── */
div[data-testid="stContainerWithBorder"] {
    background: #1F2937 !important;
    border: 1px solid #1F2937 !important;
    border-radius: 12px;
    padding: 1.25rem;
    transition: all 0.3s ease;
}
div[data-testid="stContainerWithBorder"]:hover {
    border-color: #94A3B8 !important;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

/* ── Tabs ── */
.stTabs [data-baseweb="tab-list"] {
    gap: 0;
    background: transparent;
    border-bottom: 1px solid #1F2937;
}
.stTabs [data-baseweb="tab"] {
    color: #94A3B8;
    font-weight: 500;
    transition: all 0.3s ease;
    padding: 0.75rem 1.25rem;
}
.stTabs [data-baseweb="tab"]:hover {
    color: #38BDF8;
}
.stTabs [aria-selected="true"] {
    color: #38BDF8 !important;
    background: linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, transparent 100%);
}
.stTabs [aria-selected="true"]::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0.5rem;
    right: 0.5rem;
    height: 2px;
    background: #38BDF8;
    border-radius: 2px;
}

/* ── Buttons (main area) ── */
.stButton button[kind="primary"] {
    background: #2DD4BF;
    border: none;
    color: #F7FAFC;
    font-weight: 500;
    transition: all 0.2s ease;
}
.stButton button[kind="primary"]:hover {
    background: #38BDF8;
}
.stButton button[kind="secondary"] {
    background: transparent;
    border: 1px solid #1F2937;
    color: #E5E7EB;
    transition: all 0.2s ease;
}
.stButton button[kind="secondary"]:hover {
    border-color: #94A3B8;
    background: #1F2937;
}

/* ── Progress bar ── */
.stProgress > div > div > div > div {
    background: #2DD4BF !important;
    border-radius: 4px;
}
.stProgress > div > div {
    background: #1F2937;
    border-radius: 4px;
    overflow: hidden;
}

/* ── Expander ── */
details {
    background: #0D1B2A;
    border: 1px solid #1F2937;
    border-radius: 10px;
    margin: 0.5rem 0;
    transition: border-color 0.3s ease;
}
details:hover {
    border-color: #94A3B8;
}
details summary {
    color: #94A3B8;
    font-weight: 500;
    padding: 0.5rem 0;
}

/* ── Metric ── */
div[data-testid="metric-container"] {
    background: #0D1B2A;
    border: 1px solid #1F2937;
    border-radius: 10px;
    padding: 1rem;
    transition: all 0.3s ease;
}
div[data-testid="metric-container"]:hover {
    border-color: #38BDF8;
    box-shadow: 0 0 20px rgba(56, 189, 248, 0.06);
}
div[data-testid="metric-container"] label {
    color: #94A3B8 !important;
    font-weight: 500;
}
div[data-testid="metric-container"] div[data-testid="metric-value"] {
    color: #38BDF8 !important;
    font-weight: 700;
}

/* ── Form ── */
div[data-testid="stForm"] {
    background: #0D1B2A;
    border: 1px solid #1F2937;
    border-radius: 12px;
    padding: 1.5rem;
}
div[data-testid="stForm"] input, div[data-testid="stForm"] textarea, div[data-testid="stForm"] select {
    background: #08111F !important;
    border: 1px solid #1F2937 !important;
    color: #E5E7EB !important;
    border-radius: 8px;
    transition: border-color 0.3s ease;
}
div[data-testid="stForm"] input:focus, div[data-testid="stForm"] textarea:focus {
    border-color: #38BDF8 !important;
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.15) !important;
}
div[data-testid="stForm"] label {
    color: #94A3B8 !important;
    font-weight: 500;
}

/* ── Input widgets (outside forms) ── */
.stTextInput input, .stTextArea textarea, .stSelectbox div[data-baseweb="select"] > div {
    background: #08111F !important;
    border: 1px solid #1F2937 !important;
    color: #E5E7EB !important;
    border-radius: 8px;
    transition: border-color 0.3s ease;
}
.stTextInput input:focus, .stTextArea textarea:focus {
    border-color: #38BDF8 !important;
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.15) !important;
}

/* ── Number input ── */
.stNumberInput input {
    background: #08111F !important;
    border: 1px solid #1F2937 !important;
    color: #E5E7EB !important;
    border-radius: 8px;
}
.stNumberInput button {
    background: #1F2937 !important;
    border: 1px solid #1F2937 !important;
    color: #94A3B8 !important;
}
.stNumberInput button:hover {
    border-color: #38BDF8 !important;
    color: #38BDF8 !important;
}

/* ── Info / Success / Warning / Error boxes ── */
.stAlert {
    border-radius: 10px;
    border: 1px solid;
}
.stAlert.st-info {
    background: rgba(56, 189, 248, 0.08);
    border-color: rgba(56, 189, 248, 0.3);
    color: #38BDF8;
}
.stAlert.st-success {
    background: rgba(45, 212, 191, 0.08);
    border-color: rgba(45, 212, 191, 0.3);
    color: #2DD4BF;
}
.stAlert.st-warning {
    background: rgba(245, 158, 11, 0.08);
    border-color: rgba(245, 158, 11, 0.3);
    color: #FCD34D;
}
.stAlert.st-error {
    background: rgba(251, 113, 133, 0.08);
    border-color: rgba(251, 113, 133, 0.3);
    color: #FDA4AF;
}

/* ── DataFrame ── */
div[data-testid="stDataFrame"] {
    background: #0D1B2A;
}
div[data-testid="stDataFrame"] th {
    background: #1F2937 !important;
    color: #94A3B8 !important;
    font-weight: 600;
    border-bottom: 1px solid #1F2937;
}
div[data-testid="stDataFrame"] td {
    color: #E5E7EB !important;
    background: #0D1B2A !important;
    border-bottom: 1px solid #1F2937;
}
div[data-testid="stDataFrame"] tr:hover td {
    background: #1F2937 !important;
}

/* ── Select box dropdown ── */
div[data-baseweb="select"] ul {
    background: #0D1B2A !important;
    border: 1px solid #1F2937 !important;
}
div[data-baseweb="select"] li:hover {
    background: #1F2937 !important;
}

/* ── Checkbox / Radio ── */
.stCheckbox label, .stRadio label {
    color: #E5E7EB !important;
}

/* ── Tooltip ── */
div[data-baseweb="tooltip"] {
    background: #1F2937 !important;
    border: 1px solid #1F2937 !important;
    color: #E5E7EB !important;
}
"""