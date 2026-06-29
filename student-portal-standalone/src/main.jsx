import React from 'react'
import ReactDOM from 'react-dom/client'
import StudentPortal from './StudentPortal'
import AdminRetakes from './AdminRetakes'
import './index.css'

if (import.meta.env.DEV) {
  const skipReactDevtoolsBanner = (first) =>
    typeof first === 'string' && first.includes('Download the React DevTools')
  const wrap = (fn) =>
    function patched(...args) {
      if (args.length && skipReactDevtoolsBanner(String(args[0]))) return
      return fn.apply(console, args)
    }
  console.log = wrap(console.log)
  console.info = wrap(console.info)
}

const path = (window.location.pathname || '/').replace(/\/+$/, '').toLowerCase();
const isAdmin = path === '/mo' || path.endsWith('/mo');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isAdmin ? <AdminRetakes /> : <StudentPortal />}
  </React.StrictMode>,
)
