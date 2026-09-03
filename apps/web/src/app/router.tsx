import { createBrowserRouter } from 'react-router-dom'

import { App } from './App'
import { CategoriesPage } from '../pages/CategoriesPage'
import { CreditCardsPage } from '../pages/CreditCardsPage'
import { DashboardPage } from '../pages/DashboardPage'
import { InstallmentsPage } from '../pages/InstallmentsPage'
import { RecurringExpensesPage } from '../pages/RecurringExpensesPage'
import { TransactionsPage } from '../pages/TransactionsPage'

export const router = createBrowserRouter([
  {
    children: [
      { element: <DashboardPage />, index: true },
      { element: <TransactionsPage />, path: 'transactions' },
      { element: <CreditCardsPage />, path: 'credit-cards' },
      { element: <InstallmentsPage />, path: 'installments' },
      { element: <RecurringExpensesPage />, path: 'recurring-expenses' },
      { element: <CategoriesPage />, path: 'categories' },
    ],
    element: <App />,
    path: '/',
  },
])
