;; Parses every example in src/main/mcp/pine-reference/ with pine-lang's own
;; parser, so a doc can't teach an agent syntax the bundled Pine rejects.
;; Run it through scripts/check-pine-reference.sh, from a pine-lang checkout.
;;
;; What counts as an example: each line of each fenced block, or the whole
;; block when it starts with a /* comment. Blank lines split a block into
;; separate expressions, and `$name = value` lines are values, not queries.
;; Skipped: the block after a **Syntax:** line, which is a template.
;; A line marked `-- parse error` must fail to parse.
;; A line marked `-- pine-lang #N` uses Pine from that pine-lang PR, which the
;; bundled pine-lang may not have yet. It may fail to parse. Once it parses,
;; the script says to remove the marker (see the README's release step).
(require '[pine.parser :as p] '[clojure.string :as s] '[clojure.java.io :as io])

(def dir (first *command-line-args*))

(defn examples [txt]
  (for [[_ before block] (re-seq #"(?s)([^\n]*)\n```\n(.*?)```" txt)
        :when (not (s/includes? before "**Syntax:**"))
        expr (s/split block #"\n\s*\n")
        :let [e (s/join "\n" (remove #(re-find #"^\s*\$" %) (s/split-lines expr)))]
        :when (not (s/blank? e))
        line (if (re-find #"(?m)^/\*" e) [e] (s/split-lines e))]
    line))

(defn parses? [line]
  (try (not (:error (p/parse line))) (catch Exception _ false)))

(def results
  (for [f (sort (.listFiles (io/file dir)))
        :let [name (.getName f)]
        :when (and (s/ends-with? name ".md") (not= name "README.md"))
        line (examples (slurp f))
        :let [expect-fail (s/includes? line "-- parse error")
              waiting (re-find #"-- pine-lang #\d+" line)
              parses (parses? line)
              ok (or (and waiting (not expect-fail)) (= (not expect-fail) parses))]]
    {:file name :line line :ok ok :expect-fail expect-fail :waiting waiting :parses parses}))

(doseq [{:keys [file line expect-fail]} (remove :ok results)]
  (println (if expect-fail "PARSES, but is marked as a parse error:" "DOES NOT PARSE:") file)
  (println "   " (s/replace line "\n" "\n    ")))

(doseq [{:keys [file line waiting parses]} (filter :waiting results)]
  (println (if parses
             (str "PARSES now: remove the `" waiting "` marker in " file ":")
             (str "Waiting for " (subs waiting 3) " (not in this pine-lang yet), in " file ":")))
  (println "   " (s/replace line "\n" "\n    ")))

(let [bad (count (remove :ok results))]
  (println (str (count results) " examples checked, " bad " wrong."))
  (System/exit (if (zero? bad) 0 1)))
