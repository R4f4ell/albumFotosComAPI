import { useState, useMemo, useEffect, useRef } from "react";
import { Search, List, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import "./searchBar.scss";

const SearchBar = ({ setQuery, setCategoria, setActivateSearch }) => {
  const [localQuery, setLocalQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState("");

  const dropdownRef = useRef(null);

  const categorias = useMemo(
    () => ["Natureza", "Pessoas", "Tecnologia", "Animais", "Esportes"],
    []
  );

  const handleSearch = (e) => {
    if (e?.preventDefault) e.preventDefault();

    setQuery(localQuery.trim());
    setCategoria("");
    setSelectedValue("");
    setActivateSearch(true);
    setIsOpen(false);
  };

  const handleSelect = (value) => {
    // categoria não mistura com pesquisa antiga
    setLocalQuery("");
    setQuery("");

    setSelectedValue(value);
    setCategoria(value);
    setActivateSearch(true);
    setIsOpen(false);
  };

  const getSelectedLabel = () => {
    if (selectedValue === "") return "Todas as categorias";
    if (selectedValue === "liked") return "Curtidas";
    if (selectedValue === "downloaded") return "Baixadas";
    return selectedValue;
  };

  useEffect(() => {
    const onClickOutside = (e) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <motion.form
      className="search-bar"
      role="search"
      aria-label="Pesquisar fotos"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      onSubmit={handleSearch}
    >
      <div className="input-wrapper">
        <Search className="icon" size={18} aria-hidden="true" focusable="false" />
        <input
          type="text"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          placeholder="Pesquisar fotos..."
          aria-label="Campo de busca de fotos"
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>

      <button className="search-btn" type="submit" aria-label="Executar pesquisa">
        <Search className="icon" size={18} aria-hidden="true" focusable="false" />
        Pesquisar
      </button>

      <div className="select-wrapper" ref={dropdownRef}>
        <List className="icon" size={18} aria-hidden="true" focusable="false" />

        <button
          type="button"
          className="select-trigger"
          aria-label="Selecionar categoria"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((v) => !v)}
        >
          <span className="select-trigger__label">{getSelectedLabel()}</span>
          <ChevronDown className="select-trigger__chev" size={18} aria-hidden="true" />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.ul
              className="select-options"
              role="listbox"
              aria-label="Lista de categorias"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <li
                role="option"
                aria-selected={selectedValue === ""}
                className={selectedValue === "" ? "is-selected" : ""}
                onClick={() => handleSelect("")}
              >
                Todas as categorias
              </li>

              {categorias.map((cat) => (
                <li
                  key={cat}
                  role="option"
                  aria-selected={selectedValue === cat}
                  className={selectedValue === cat ? "is-selected" : ""}
                  onClick={() => handleSelect(cat)}
                >
                  {cat}
                </li>
              ))}

              <li
                role="option"
                aria-selected={selectedValue === "liked"}
                className={selectedValue === "liked" ? "is-selected" : ""}
                onClick={() => handleSelect("liked")}
              >
                Curtidas
              </li>

              <li
                role="option"
                aria-selected={selectedValue === "downloaded"}
                className={selectedValue === "downloaded" ? "is-selected" : ""}
                onClick={() => handleSelect("downloaded")}
              >
                Baixadas
              </li>
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </motion.form>
  );
};

export default SearchBar;