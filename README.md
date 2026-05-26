# Álbum de Fotos

Aplicação web responsiva para buscar, visualizar e ampliar imagens utilizando a API do Unsplash. Possui filtro por categorias e busca personalizada.

---

## Tecnologias

- React
- Vite
- SCSS Modular (Mobile First)
- Supabase (para curtidas e downloads)
- Lucide Icons
- Framer Motion (animações)

## Funcionalidades

- Buscar fotos pela **API do Unsplash**
- Filtro por **categoria** ou **termos personalizados**
- Visualização em **grid responsivo**
- **Curtir fotos** com persistência no Supabase
- **Baixar imagens** com contagem registrada no Supabase
- **Visualização em tela ampliada com zoom** no cursor
- **Scroll bloqueado** ao abrir modal
- **Fechar modal** com X ou clique fora
- **Animações suaves** com Framer Motion
- **Layout 100% responsivo**, adaptado para mobile, tablet e desktop
- **Filtro “Curtidas”** para exibir apenas as imagens já curtidas
- **Filtro “Baixadas”** para exibir apenas as imagens já baixadas
- **Atualização otimista** ao curtir (sem reload)
- **Mensagens de feedback** como "Carregando..." e "Nada encontrado"
