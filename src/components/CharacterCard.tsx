import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { MessageSquareHeart } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export type Character = Tables<"characters">;

export function CharacterAvatar({
  character,
  size = "md",
}: {
  character: Pick<Character, "name" | "avatar_url" | "accent">;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "sm" ? "size-9" : size === "lg" ? "size-16" : "size-12";
  if (character.avatar_url) {
    return (
      <img
        src={character.avatar_url}
        alt={character.name}
        loading="lazy"
        className={`${dim} shrink-0 rounded-xl object-cover`}
      />
    );
  }
  return (
    <span
      className={`${dim} grid shrink-0 place-items-center rounded-xl font-serif text-lg text-foreground`}
      style={{ background: character.accent ?? "oklch(0.3 0.06 300)" }}
    >
      {character.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export async function startChatWithCharacter(character: Character) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { redirectToAuth: true as const };

  const { data, error } = await supabase
    .from("chats")
    .insert({
      user_id: auth.user.id,
      character_id: character.id,
      title: character.name,
      character_snapshot: {
        name: character.name,
        persona: character.persona,
        scenario: character.scenario,
        tagline: character.tagline,
        avatar_url: character.avatar_url,
        accent: character.accent,
      },
    })
    .select("id")
    .single();
  if (error) throw error;

  if (character.greeting?.trim()) {
    const { error: msgError } = await supabase.from("chat_messages").insert({
      chat_id: data.id,
      user_id: auth.user.id,
      role: "assistant",
      content: character.greeting.trim(),
    });
    if (msgError) throw msgError;
  }

  return { chatId: data.id };
}

export function CharacterCard({ character }: { character: Character }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const result = await startChatWithCharacter(character);
      if ("redirectToAuth" in result) {
        navigate({ to: "/auth" });
        return;
      }
      navigate({ to: "/chat/$chatId", params: { chatId: result.chatId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir a conversa");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group flex flex-col rounded-2xl border border-border/70 bg-card/60 p-5 transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3">
        <CharacterAvatar character={character} />
        <div className="min-w-0">
          <h3 className="truncate font-serif text-lg">{character.name}</h3>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {character.tagline || character.persona.slice(0, 90)}
          </p>
        </div>
      </div>

      {character.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {character.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border/70 px-2 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <Button size="sm" className="flex-1" disabled={busy} onClick={() => void start()}>
          <MessageSquareHeart className="size-4" /> Conversar
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link to="/characters/$characterId" params={{ characterId: character.id }}>
            Ver
          </Link>
        </Button>
      </div>
    </div>
  );
}
