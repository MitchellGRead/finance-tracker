import { useTRPC } from "./lib/trpc";
import { useQuery } from "@tanstack/react-query";

export function App() {
  const trpc = useTRPC();
  const usersQuery = useQuery(trpc.users.list.queryOptions());

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold text-gray-900">Finance Tracker</h1>
        <p className="mt-2 text-gray-600">
          Household finance tracking and splitting
        </p>

        <div className="mt-8 rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800">Users</h2>
          {usersQuery.isLoading && (
            <p className="mt-2 text-gray-500">Loading...</p>
          )}
          {usersQuery.data && usersQuery.data.length === 0 && (
            <p className="mt-2 text-gray-500">
              No users yet. Add one to get started.
            </p>
          )}
          {usersQuery.data && usersQuery.data.length > 0 && (
            <ul className="mt-2 space-y-1">
              {usersQuery.data.map((user) => (
                <li key={user.id} className="text-gray-700">
                  {user.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
