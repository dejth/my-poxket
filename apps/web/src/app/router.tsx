import { createBrowserRouter } from 'react-router-dom'

import { App } from './App'
import { CategoriesPage } from '../pages/CategoriesPage'
import { DashboardPage } from '../pages/DashboardPage'
import { TransactionsPage } from '../pages/TransactionsPage'

export const router = createBrowserRouter([
  {
    children: [
      { element: <DashboardPage />, index: true },
      { element: <TransactionsPage />, path: 'transactions' },
      { element: <CategoriesPage />, path: 'categories' },
    ],
    element: <App />,
    path: '/',
  },
])
