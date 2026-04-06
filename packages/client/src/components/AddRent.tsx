import { useState, useEffect } from "react";
import { useTRPC } from "../lib/trpc";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface AddRentProps {
  month: number;
  year: number;
}

export function AddRent({ month, year }: AddRentProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [userName, setUserName] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(
    `${year}-${String(month).padStart(2, "0")}-01`
  );

  const usersQuery = useQuery(trpc.users.list.queryOptions());

  const categoriesQuery = useQuery(trpc.categories.list.queryOptions());

  const getUserId = (name: string) =>
    usersQuery.data?.find((u) => u.name === name)?.id;

  const getRentCategoryId = () =>
    categoriesQuery.data?.find((c) => c.name.toLowerCase() === "rent")?.id ?? null;

  useEffect(() => {
    setDate(`${year}-${String(month).padStart(2, "0")}-01`);
  }, [month, year]);

  const createMutation = useMutation(
    trpc.lineItems.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.lineItems.list.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.lineItems.countByMonth.queryKey(),
        });
        setOpen(false);
        setAmount("");
        setUserName("");
      },
    })
  );

  const handleSubmit = () => {
    const userId = getUserId(userName);
    if (!userId || !amount) return;
    createMutation.mutate({
      userId,
      date,
      description: "RENT",
      amount: parseFloat(amount),
      status: "accepted",
      categoryId: getRentCategoryId(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm" className="h-8 text-sm">
          + Rent
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Add Rent</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label className="text-xs">User</Label>
            <Select
              value={userName}
              onValueChange={(v) => {
                if (v) setUserName(v);
              }}
            >
              <SelectTrigger className="h-8 text-sm mt-1">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {usersQuery.data?.map((user) => (
                  <SelectItem key={user.id} value={user.name}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Amount</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-8 text-sm mt-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          </div>
          <div>
            <Label className="text-xs">Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-sm mt-1"
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!userName || !amount || createMutation.isPending}
            className="h-8 text-sm"
          >
            {createMutation.isPending ? "Adding..." : "Add Rent"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
