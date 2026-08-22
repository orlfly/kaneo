import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import TeamLayout from "@/components/common/team-layout";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import useGlobalSearch from "@/hooks/queries/search/use-global-search";
import { getPriorityIcon } from "@/lib/priority";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/team/$teamId/search",
)({
  component: SearchComponent,
});

function SearchComponent() {
  const { t } = useTranslation();
  const { teamId } = Route.useParams();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, isFetching } = useGlobalSearch({
    q: debouncedQuery,
    teamId,
    type: "tasks",
  });

  const handleInputChange = useCallback((value: string) => {
    setSearchInput(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value.trim());
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const results = data?.results ?? [];
  const hasQuery = debouncedQuery.length > 0;
  const showLoading = hasQuery && (isLoading || isFetching);

  const quickSearchSuggestions = useMemo(
    () => [
      t("team:search.suggestionHighPriority"),
      t("team:search.suggestionBug"),
      t("team:search.suggestionFeature"),
      t("team:search.suggestionInProgress"),
      t("team:search.suggestionCompleted"),
    ],
    [t],
  );

  return (
    <>
      <PageTitle title={t("team:search.pageTitle")} />
      <TeamLayout
        title={t("team:search.pageTitle")}
        headerActions={
          <Link to="/dashboard/team/$teamId" params={{ teamId }}>
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              {t("team:search.backToDashboard")}
            </Button>
          </Link>
        }
      >
        <div className="space-y-6">
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder={t("team:search.placeholder")}
                value={searchInput}
                onChange={(e) => handleInputChange(e.target.value)}
                className="pl-10 h-12 text-lg"
                autoFocus
              />
              {showLoading && (
                <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {t("team:search.hint")}
            </p>
          </div>

          {hasQuery ? (
            <div>
              {showLoading && results.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      {t("team:search.searching")}
                    </p>
                  </div>
                </div>
              ) : results.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground mb-3">
                    {t("team:search.resultsFound", {
                      count: data?.totalCount ?? results.length,
                    })}
                  </p>
                  {results.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => {
                        if (result.type === "task" && result.projectId) {
                          navigate({
                            to: "/dashboard/team/$teamId/project/$projectId/board",
                            params: {
                              teamId,
                              projectId: result.projectId,
                            },
                            search: { taskId: result.id },
                          });
                        }
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-background hover:bg-accent/60 transition-colors text-left"
                    >
                      <div className="flex-shrink-0 first:[&_svg]:h-4 first:[&_svg]:w-4">
                        {getPriorityIcon(result.priority ?? "")}
                      </div>

                      {result.projectSlug && result.taskNumber && (
                        <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                          {result.projectSlug}-{result.taskNumber}
                        </span>
                      )}

                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-foreground truncate block">
                          {result.title}
                        </span>
                      </div>

                      {result.projectName && (
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {result.projectName}
                        </span>
                      )}

                      {result.status && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded border border-border bg-muted/55 text-muted-foreground flex-shrink-0">
                          {result.status}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-medium mb-2">
                    {t("team:search.noResultsTitle")}
                  </p>
                  <p className="text-muted-foreground">
                    {t("team:search.noResultsDescription")}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">
                {t("team:search.startTitle")}
              </h2>
              <p className="text-muted-foreground mb-6">
                {t("team:search.startDescription")}
              </p>

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  {t("team:search.quickSearchesLabel")}
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {quickSearchSuggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearchInput(suggestion);
                        setDebouncedQuery(suggestion);
                      }}
                      className="text-xs"
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </TeamLayout>
    </>
  );
}
