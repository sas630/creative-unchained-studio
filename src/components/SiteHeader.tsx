import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Feather, MessageSquareHeart, Sparkles, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Brand({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`}>
      <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
        <Sparkles className="size-4" />
      </span>
      <span className="font-serif text-lg tracking-tight">Lumen</span>
    </Link>
  );
}

export function SiteHeader() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Brand />
          <nav className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
            <Link
              to="/characters"
              className="rounded-md px-3 py-2 transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "text-foreground bg-secondary" }}
            >
              <span className="inline-flex items-center gap-2">
                <Users className="size-4" /> Personagens
              </span>
            </Link>
            <Link
              to="/chat"
              className="rounded-md px-3 py-2 transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "text-foreground bg-secondary" }}
            >
              <span className="inline-flex items-center gap-2">
                <MessageSquareHeart className="size-4" /> Roleplay
              </span>
            </Link>
            <Link
              to="/stories"
              className="rounded-md px-3 py-2 transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "text-foreground bg-secondary" }}
            >
              <span className="inline-flex items-center gap-2">
                <Feather className="size-4" /> Histórias
              </span>
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {loading ? null : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="max-w-44 truncate">
                  {user.email}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link to="/chat">Minhas conversas</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/stories">Minhas histórias</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings">Ajustes</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()}>Sair</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth">Entrar</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Criar conta
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
