import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save, Upload, Archive, Eye, EyeOff, Trash2, Truck } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { toast } from "@/components/ui/sonner";
import { ProductStatusBadge } from "@/components/storefront/ProductStatusBadge";
import {
  getSellerProductDetail,
  updateProduct,
  archiveProduct,
  getProductCategories,
} from "@/services/seller-storefront.service";
import { getSellerDashboard } from "@/services/seller-dashboard.service";

const SellerProductDetail = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [conditionLabel, setConditionLabel] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("0");
  const [agreementTerms, setAgreementTerms] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [sellerNotes, setSellerNotes] = useState("");
  const [visibilityType, setVisibilityType] = useState("public");

  const { data: dashData } = useQuery({
    queryKey: ["seller-dashboard"],
    queryFn: getSellerDashboard,
    staleTime: 60_000,
  });

  const { data: categories } = useQuery({
    queryKey: ["product-categories"],
    queryFn: getProductCategories,
    staleTime: 300_000,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["seller-product-detail", productId],
    queryFn: () => getSellerProductDetail(productId!),
    enabled: !!productId,
  });

  useEffect(() => {
    if (data?.product) {
      const p = data.product;
      setTitle(p.title || "");
      setCategoryId(p.category_id || null);
      setShortDescription(p.short_description || "");
      setDescription(p.description || "");
      setConditionLabel(p.condition_label || "");
      setUnitPrice(String(p.unit_price || ""));
      setStockQuantity(String(p.stock_quantity || 0));
      setAgreementTerms(p.agreement_terms || "");
      setDeliveryMethod(p.delivery_method || "");
      setSellerNotes(p.seller_notes || "");
      setVisibilityType(p.visibility_type || "public");
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (payload: any) => updateProduct(productId!, payload),
    onSuccess: () => {
      toast.success("Product updated");
      queryClient.invalidateQueries({ queryKey: ["seller-product-detail", productId] });
      queryClient.invalidateQueries({ queryKey: ["seller-products"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveProduct(productId!),
    onSuccess: () => {
      toast.success("Product archived");
      navigate("/seller/storefront");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = () => {
    updateMutation.mutate({
      title,
      category_id: categoryId,
      short_description: shortDescription,
      description,
      condition_label: conditionLabel,
      unit_price: parseFloat(unitPrice),
      stock_quantity: parseInt(stockQuantity) || 0,
      agreement_terms: agreementTerms,
      delivery_method: deliveryMethod,
      seller_notes: sellerNotes,
      visibility_type: visibilityType,
    });
  };

  const handleStatusToggle = () => {
    const currentStatus = data?.product?.status;
    const newStatus = currentStatus === "published" ? "draft" : "published";
    updateMutation.mutate({ status: newStatus });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-success" />
      </div>
    );
  }

  if (isError || !data?.product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <h2 className="text-xl font-bold">Product not found</h2>
        <Button onClick={() => navigate("/seller/storefront")}>Back to Storefront</Button>
      </div>
    );
  }

  const product = data.product;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SellerNav
        sellerName={dashData?.seller?.full_name || "Seller"}
        avatarUrl={dashData?.seller?.avatar_url || null}
      />

      <div className="bg-gradient-to-br from-sky-50 via-background to-green-50 dark:from-sky-950/20 dark:via-background dark:to-green-950/20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
          <Button
            variant="ghost"
            className="mb-4 gap-2 text-muted-foreground"
            onClick={() => navigate("/seller/storefront")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Storefront
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Edit Product</h1>
              <div className="flex items-center gap-2 mt-1">
                <ProductStatusBadge status={product.status} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleStatusToggle}
                disabled={updateMutation.isPending}
                className="gap-1.5"
              >
                {product.status === "published" ? (
                  <><EyeOff className="h-3.5 w-3.5" /> Unpublish</>
                ) : (
                  <><Eye className="h-3.5 w-3.5" /> Publish</>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => archiveMutation.mutate()}
                disabled={archiveMutation.isPending}
                className="gap-1.5 text-destructive hover:text-destructive"
              >
                <Archive className="h-3.5 w-3.5" /> Archive
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <Card className="rounded-xl">
            <CardHeader><CardTitle>Product Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={categoryId || ""} onValueChange={(v) => setCategoryId(v || null)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {(categories || []).map((cat: any) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Short Description</Label>
                <Input value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} />
              </div>
              <div>
                <Label>Full Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
              </div>
              <div>
                <Label>Condition</Label>
                <Select value={conditionLabel} onValueChange={setConditionLabel}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brand_new">Brand New</SelectItem>
                    <SelectItem value="like_new">Like New</SelectItem>
                    <SelectItem value="used_good">Used - Good</SelectItem>
                    <SelectItem value="used_fair">Used - Fair</SelectItem>
                    <SelectItem value="refurbished">Refurbished</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <CardHeader><CardTitle>Pricing & Stock</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Price (₦)</Label>
                  <Input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
                </div>
                <div>
                  <Label>Stock Quantity</Label>
                  <Input type="number" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Agreement Terms</Label>
                <Textarea value={agreementTerms} onChange={(e) => setAgreementTerms(e.target.value)} rows={3} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <CardHeader><CardTitle>Delivery & Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Delivery Method</Label>
                <Select value={deliveryMethod} onValueChange={setDeliveryMethod}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pickup">Pickup</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                    <SelectItem value="shipping">Shipping</SelectItem>
                    <SelectItem value="digital">Digital / Instant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Seller Notes (private)</Label>
                <Textarea value={sellerNotes} onChange={(e) => setSellerNotes(e.target.value)} rows={3} />
              </div>
              <div>
                <Label>Visibility</Label>
                <Select value={visibilityType} onValueChange={setVisibilityType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="private_draft">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Media preview */}
          {product.media?.length > 0 && (
            <Card className="rounded-xl">
              <CardHeader><CardTitle>Media</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {product.media.map((m: any) => (
                    <div key={m.id} className="aspect-square rounded-lg border overflow-hidden">
                      {m.media_type === "video" ? (
                        <video src={m.file_url} className="w-full h-full object-cover" />
                      ) : (
                        <img src={m.file_url} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="bg-success hover:bg-success/90 text-white gap-2"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default SellerProductDetail;
