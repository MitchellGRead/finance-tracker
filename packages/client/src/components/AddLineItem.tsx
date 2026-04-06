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

interface AddLineItemProps {
  month: number;
  year: number;
}

export function AddLineItem({ month, year }: AddLineItemProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [userName, setUserName] = useState<string>("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(
    `${year}-${String(month).padStart(2, "0")}-01`
  );
  const [note, setNote] = useState("");
  const [categoryName, setCategoryName] = useState<string>("");

  const usersQuery = useQuery(trpc.users.list.queryOptions());
  const categoriesQuery = useQuery(trpc.categories.list.queryOptions());

  const getUserId = (name: string) =>
    usersQuery.data?.find((u) => u.name === name)?.id;

  const getCategoryId = (name: string) =>
    categoriesQuery.data?.find((c) => c.name === name)?.id ?? null;

  // Sync date default when month/year props change
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
        resetForm();
      },
    })
  );

  const resetForm = () => {
    setDescription("");
    setAmount("");
    setNote("");
    setUserName("");
    setCategoryName("");
  };

  const handleSubmit = () => {
    const userId = getUserId(userName);
    if (!userId || !description || !amount) return;
    createMutation.mutate({
      userId,
      date,
      description,
      amount: parseFloat(amount),
      categoryId: categoryName ? getCategoryId(categoryName) : undefined,
      note: note || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm" className="h-8 text-sm">
          + Add Item
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Manual Line Item</DialogTitle>
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
            <Label className="text-xs">Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-sm mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Cash repayment"
              className="h-8 text-sm mt-1"
            />
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
            />
          </div>
          <div>
            <Label className="text-xs">Category (optional)</Label>
            <Select
              value={categoryName}
              onValueChange={(v) => {
                if (v) setCategoryName(v === "none" ? "" : v);
              }}
            >
              <SelectTrigger className="h-8 text-sm mt-1">
                <SelectValue placeholder="No category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {categoriesQuery.data?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.name}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Note (optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-8 text-sm mt-1"
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={
              !userName || !description || !amount || createMutation.isPending
            }
            className="h-8 text-sm"
          >
            {createMutation.isPending ? "Adding..." : "Add Item"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
