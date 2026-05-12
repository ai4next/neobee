import streamlit as st

if st.session_state.get("session_id") and st.session_state.get("view") == "session":
    st.switch_page("pages/2_Session_View.py")
else:
    st.switch_page("pages/1_New_Session.py")