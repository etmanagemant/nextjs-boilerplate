"use client";

import { useState, useEffect } from "react";
import {
  updateContentPlanPost,
  updateContentPlanSort,
  deleteContentPlanPost,
  addContentCommunity,
  deleteContentCommunity,
} from "@/app/content-plan/actions";

interface ContentPost {
  id: string;
  model_id: string;
  photo_path: string;
  post_date: string | null;
  content_type: string | null;
  title_idea: string | null;
  published: boolean;
  communities: string[] | null;
  sort_order: number;
}

interface Community {
  id: string;
  name: string;
}

interface Model {
  id: string;
  name: string;
}

type ContentPlanClientProps = {
  initialPosts: ContentPost[];
  communities: Community[];
  models: Model[];
  selectedModelId: string;
};

export default function ContentPlanClient({
  initialPosts,
  communities: initialCommunities,
  models,
  selectedModelId,
}: ContentPlanClientProps) {
  const [posts, setPosts] = useState<ContentPost[]>(initialPosts);
  const [communities, setCommunities] = useState<Community[]>(initialCommunities);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [newCommunityName, setNewCommunityName] = useState("");
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<ContentPost>>({});

  // ========================================
  // DRAG & DROP LOGIC
  // ========================================
  const handleDragStart = (postId: string) => {
    setDraggedItem(postId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetPostId: string) => {
    if (!draggedItem || draggedItem === targetPostId) {
      setDraggedItem(null);
      return;
    }

    const draggedIndex = posts.findIndex((p) => p.id === draggedItem);
    const targetIndex = posts.findIndex((p) => p.id === targetPostId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedItem(null);
      return;
    }

    // Reorder locally
    const newPosts = [...posts];
    const [movedPost] = newPosts.splice(draggedIndex, 1);
    newPosts.splice(targetIndex, 0, movedPost);

    // Update sort_order
    const sortUpdates = newPosts.map((post, idx) => ({
      id: post.id,
      sort_order: idx + 1,
    }));

    setPosts(newPosts);
    setDraggedItem(null);

    // Persist to DB
    await updateContentPlanSort(sortUpdates);
  };

  // ========================================
  // EDIT & SAVE POST
  // ========================================
  const startEditingPost = (post: ContentPost) => {
    setEditingPost(post.id);
    setEditValues({
      post_date: post.post_date || "",
      content_type: post.content_type || "",
      title_idea: post.title_idea || "",
      published: post.published || false,
      communities: post.communities || [],
    });
  };

  const savePostEdits = async () => {
    if (!editingPost) return;

    await updateContentPlanPost(editingPost, {
      post_date: editValues.post_date as string,
      content_type: editValues.content_type as string,
      title_idea: editValues.title_idea as string,
      published: editValues.published as boolean,
      communities: editValues.communities as string[],
    });

    setPosts((prevPosts) =>
      prevPosts.map((p) =>
        p.id === editingPost
          ? {
              ...p,
              post_date: editValues.post_date as string,
              content_type: editValues.content_type as string,
              title_idea: editValues.title_idea as string,
              published: editValues.published as boolean,
              communities: editValues.communities as string[],
            }
          : p
      )
    );

    setEditingPost(null);
    setEditValues({});
  };

  const cancelEdits = () => {
    setEditingPost(null);
    setEditValues({});
  };

  // ========================================
  // COMMUNITY MANAGEMENT
  // ========================================
  const handleAddCommunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommunityName.trim()) return;

    const formData = new FormData();
    formData.append("name", newCommunityName);
    await addContentCommunity(formData);

    setNewCommunityName("");
    // Refresh communities (would be better with state update from server action)
    window.location.reload();
  };

  const handleDeleteCommunity = async (id: string) => {
    await deleteContentCommunity(id);
    setCommunities((prev) => prev.filter((c) => c.id !== id));
  };

  const toggleCommunity = (communityId: string) => {
    if (!editValues.communities) {
      setEditValues({ ...editValues, communities: [] });
      return;
    }

    setEditValues((prev) => ({
      ...prev,
      communities: prev.communities?.includes(communityId)
        ? (prev.communities?.filter((c) => c !== communityId) as string[])
        : ([...(prev.communities || []), communityId] as string[]),
    }));
  };

  // ========================================
  // DELETE POST
  // ========================================
  const handleDeletePost = async (postId: string) => {
    if (confirm("Post wirklich löschen?")) {
      await deleteContentPlanPost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    }
  };

  return (
    <div className="space-y-8">
      {/* ========================================
          COMMUNITY MANAGER
          ======================================== */}
      <section className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 shadow-lg">
        <h2 className="text-sm font-bold mb-4 text-[#D4AF37] uppercase tracking-wider">
          📌 Community-Manager
        </h2>
        <div className="flex gap-3 mb-6">
          <form onSubmit={handleAddCommunity} className="flex gap-3 w-full">
            <input
              type="text"
              placeholder="Neue Community/Subreddit..."
              value={newCommunityName}
              onChange={(e) => setNewCommunityName(e.target.value)}
              className="flex-1 px-3 py-2 border border-[#AA7C11]/30 rounded-md text-sm text-white bg-[#050505] focus:border-[#D4AF37] outline-none"
            />
            <button
              type="submit"
              className="bg-gradient-to-b from-[#D4AF37] to-[#AA7C11] text-black px-4 py-2 rounded-md text-sm font-bold hover:from-[#E5C158] transition cursor-pointer"
            >
              Hinzufügen
            </button>
          </form>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {communities.map((community) => (
            <div
              key={community.id}
              className="bg-[#050505] border border-[#AA7C11]/20 rounded p-2 flex justify-between items-center"
            >
              <span className="text-xs text-white truncate">{community.name}</span>
              <button
                onClick={() => handleDeleteCommunity(community.id)}
                className="text-red-400 hover:text-red-300 text-xs ml-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================
          CONTENT PLAN POSTS (EXPLORER GRID)
          ======================================== */}
      <section className="bg-black/40 p-6 rounded-xl border border-[#AA7C11]/10 shadow-lg">
        <h2 className="text-sm font-bold mb-6 text-[#D4AF37] uppercase tracking-wider">
          🖼️ Content-Fotos & Plan
        </h2>

        {posts.length === 0 ? (
          <div className="text-center text-slate-400 py-12">
            <p className="text-sm">Noch keine Posts für dieses Model.</p>
            <p className="text-xs mt-2">Lege Bilder im <code className="bg-[#050505] px-1 rounded text-[#D4AF37]">public/images/</code> Ordner ab und speichere den Dateinamen in dieser Tabelle.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {posts.map((post) => (
              <div
                key={post.id}
                draggable
                onDragStart={() => handleDragStart(post.id)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(post.id)}
                className={`bg-[#050505] border-2 rounded-lg overflow-hidden transition cursor-move transform hover:scale-105 ${
                  draggedItem === post.id
                    ? "border-[#D4AF37] opacity-50"
                    : "border-[#AA7C11]/20 hover:border-[#D4AF37]/50"
                }`}
              >
                {/* PHOTO */}
                <div className="aspect-square bg-black/80 overflow-hidden relative group">
                  <img
                    src={`/images/${post.photo_path}`}
                    alt="Content"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect fill='%23333' width='200' height='200'/%3E%3Ctext x='50%25' y='50%25' font-size='14' fill='%23999' text-anchor='middle' dy='.3em'%3EImage not found%3C/text%3E%3C/svg%3E";
                    }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => startEditingPost(post)}
                      className="bg-[#D4AF37] text-black px-3 py-1 rounded text-xs font-bold hover:bg-[#E5C158] cursor-pointer"
                    >
                      ✏️ Bearbeiten
                    </button>
                  </div>
                </div>

                {/* INFO SECTION */}
                {editingPost === post.id ? (
                  // EDIT MODE
                  <div className="p-3 space-y-2 text-xs bg-[#0A0A0A]">
                    <div>
                      <label className="text-[#D4AF37] font-semibold block mb-1">Datum</label>
                      <input
                        type="date"
                        value={editValues.post_date || ""}
                        onChange={(e) =>
                          setEditValues({ ...editValues, post_date: e.target.value })
                        }
                        className="w-full bg-[#050505] border border-[#AA7C11]/30 rounded px-2 py-1 text-white outline-none focus:border-[#D4AF37]"
                      />
                    </div>

                    <div>
                      <label className="text-[#D4AF37] font-semibold block mb-1">Typ</label>
                      <select
                        value={editValues.content_type || ""}
                        onChange={(e) =>
                          setEditValues({ ...editValues, content_type: e.target.value })
                        }
                        className="w-full bg-[#050505] border border-[#AA7C11]/30 rounded px-2 py-1 text-white outline-none focus:border-[#D4AF37]"
                      >
                        <option value="">Wählen...</option>
                        <option value="photo">Foto</option>
                        <option value="video">Video</option>
                        <option value="story">Story</option>
                        <option value="carousel">Carousel</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[#D4AF37] font-semibold block mb-1">Titel-Idee</label>
                      <input
                        type="text"
                        value={editValues.title_idea || ""}
                        onChange={(e) =>
                          setEditValues({ ...editValues, title_idea: e.target.value })
                        }
                        placeholder="Titel..."
                        className="w-full bg-[#050505] border border-[#AA7C11]/30 rounded px-2 py-1 text-white outline-none focus:border-[#D4AF37]"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editValues.published || false}
                        onChange={(e) =>
                          setEditValues({ ...editValues, published: e.target.checked })
                        }
                        className="cursor-pointer"
                      />
                      <label className="text-[#D4AF37] font-semibold cursor-pointer">
                        Veröffentlicht
                      </label>
                    </div>

                    <div>
                      <label className="text-[#D4AF37] font-semibold block mb-2">
                        Communities
                      </label>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {communities.map((community) => (
                          <label
                            key={community.id}
                            className="flex items-center gap-2 cursor-pointer hover:bg-[#1a1a1a] p-1 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={
                                (editValues.communities as string[])?.includes(community.id) ||
                                false
                              }
                              onChange={() => toggleCommunity(community.id)}
                              className="cursor-pointer"
                            />
                            <span className="text-white text-xs">{community.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-[#AA7C11]/10">
                      <button
                        onClick={savePostEdits}
                        className="flex-1 bg-emerald-600 text-white px-2 py-1 rounded text-xs font-bold hover:bg-emerald-700 cursor-pointer"
                      >
                        ✓ Speichern
                      </button>
                      <button
                        onClick={cancelEdits}
                        className="flex-1 bg-red-600/20 text-red-400 px-2 py-1 rounded text-xs font-bold hover:bg-red-600/40 cursor-pointer"
                      >
                        ✕ Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  // VIEW MODE
                  <div className="p-3 space-y-1 text-xs bg-[#0A0A0A]">
                    <div className="flex items-center justify-between">
                      <span className="text-[#D4AF37] font-semibold">Datum:</span>
                      <span className="text-white">{post.post_date || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#D4AF37] font-semibold">Typ:</span>
                      <span className="text-white">{post.content_type || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#D4AF37] font-semibold">Titel:</span>
                      <span className="text-white truncate text-right max-w-[140px]">
                        {post.title_idea || "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#D4AF37] font-semibold">Status:</span>
                      <span className={post.published ? "text-emerald-400" : "text-slate-500"}>
                        {post.published ? "✓ Online" : "○ Entwurf"}
                      </span>
                    </div>

                    {(post.communities || []).length > 0 && (
                      <div className="pt-2 border-t border-[#AA7C11]/10">
                        <span className="text-[#D4AF37] font-semibold text-xs">Communities:</span>
                        <div className="text-[10px] text-slate-400 mt-1">
                          {post.communities
                            ?.map(
                              (cId) =>
                                communities.find((c) => c.id === cId)?.name || cId
                            )
                            .join(", ")}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2 border-t border-[#AA7C11]/10">
                      <button
                        onClick={() => startEditingPost(post)}
                        className="flex-1 bg-[#D4AF37]/10 text-[#D4AF37] px-2 py-1 rounded text-xs font-bold hover:bg-[#D4AF37]/20 cursor-pointer"
                      >
                        ✏️ Bearbeiten
                      </button>
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="flex-1 bg-red-600/10 text-red-400 px-2 py-1 rounded text-xs font-bold hover:bg-red-600/20 cursor-pointer"
                      >
                        🗑️ Löschen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
