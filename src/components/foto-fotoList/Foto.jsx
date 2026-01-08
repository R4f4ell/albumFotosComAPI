const Foto = ({ dados, setFotoAmpliada }) => {
  if (!dados?.urls?.small) return null;

  const {
    urls: { small },
    alt_description,
    width,
    height,
  } = dados;

  const handleClick = () => setFotoAmpliada(dados);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setFotoAmpliada(dados);
    }
  };

  const aspectRatio = width && height ? `${width} / ${height}` : "1 / 1";

  return (
    <button
      type="button"
      className="foto"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label="Visualizar foto ampliada"
      role="listitem"
    >
      <span className="foto__frame" style={{ aspectRatio }}>
        <img
          src={small}
          alt={alt_description || "Foto sem descrição"}
          loading="lazy"
          decoding="async"
        />
      </span>
    </button>
  );
};

export default Foto;
