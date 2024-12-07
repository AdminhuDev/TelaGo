// Configurações da API
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original';

// API de Conteúdo
class ContentAPI {
    static getAccessToken() {
        return window.ACCESS_TOKEN;
    }

    static async fetchWithAuth(url) {
        const token = this.getAccessToken();
        if (!token) {
            throw new Error('Token de acesso não configurado');
        }

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(`Erro na API: ${response.status} - ${error.status_message || response.statusText}`);
        }

        return response.json();
    }

    static convertUSRatingToBR(usRating) {
        const ratingMap = {
            'G': 'L',
            'PG': '10',
            'PG-13': '12',
            'R': '16',
            'NC-17': '18'
        };
        return ratingMap[usRating] || '14';
    }

    static async fetchTrending() {
        try {
            return await this.fetchWithAuth(
                `${BASE_URL}/movie/popular?language=pt-BR&page=1`
            );
        } catch (error) {
            console.error('Erro ao buscar filmes populares:', error);
            return { results: [] };
        }
    }

    static async fetchByGenre(genreId, sortBy = 'popularity.desc') {
        try {
            const url = genreId > 0 
                ? `${BASE_URL}/discover/movie?language=pt-BR&with_genres=${genreId}&sort_by=${sortBy}`
                : `${BASE_URL}/movie/now_playing?language=pt-BR`;
                
            return await this.fetchWithAuth(url);
        } catch (error) {
            console.error('Erro ao buscar por gênero:', error);
            return { results: [] };
        }
    }

    static async fetchContentDetails(id) {
        try {
            const [details, releases] = await Promise.all([
                this.fetchWithAuth(
                    `${BASE_URL}/movie/${id}?language=pt-BR&append_to_response=videos,credits`
                ),
                this.fetchWithAuth(
                    `${BASE_URL}/movie/${id}/release_dates`
                )
            ]);

            // Obter classificação indicativa brasileira
            const brReleases = releases.results.find(r => r.iso_3166_1 === 'BR');
            const usReleases = releases.results.find(r => r.iso_3166_1 === 'US');
            
            // Tentar obter classificação BR primeiro, se não houver, converter do US
            let rating = brReleases?.release_dates[0]?.certification || '';
            if (!rating && usReleases?.release_dates[0]?.certification) {
                rating = this.convertUSRatingToBR(usReleases.release_dates[0].certification);
            }
            
            // Se ainda não tiver rating e for uma animação ou filme familiar, definir como L
            if (!rating && details.genres) {
                const isAnimation = details.genres.some(g => g.id === 16); // ID 16 é Animação
                const isFamily = details.genres.some(g => g.id === 10751); // ID 10751 é Família
                if (isAnimation || isFamily) {
                    rating = 'L';
                }
            }

            // Se ainda não tiver rating, usar o padrão '14'
            rating = rating || '14';

            return { ...details, rating };
        } catch (error) {
            console.error('Erro ao buscar detalhes:', error);
            return null;
        }
    }

    static async searchContent(query) {
        try {
            if (!query.trim()) return { results: [] };

            const response = await this.fetchWithAuth(
                `${BASE_URL}/search/multi?language=pt-BR&query=${encodeURIComponent(query)}&page=1`
            );

            // Filtrar apenas filmes e séries
            response.results = response.results
                .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
                .slice(0, 6); // Limitar a 6 resultados

            return response;
        } catch (error) {
            console.error('Erro ao buscar conteúdo:', error);
            return { results: [] };
        }
    }
}

// UI Manager
class UIManager {
    constructor() {
        this.currentSlideIndex = 0;
        this.autoplayInterval = null;
        this.isMuted = true;
        this.player = null;
        this.currentTrailer = null;
    }

    async initialize() {
        try {
            // Configurar hero section
            await this.setupHeroSection();

            // Carregar conteúdo
            const [
                trending,
                newReleases,
                action,
                comedy,
                horror,
                documentary,
                sciFi,
                animation,
                drama
            ] = await Promise.all([
                ContentAPI.fetchTrending(),
                ContentAPI.fetchByGenre(0, 'release_date.desc'), // Lançamentos
                ContentAPI.fetchByGenre(28),  // Ação
                ContentAPI.fetchByGenre(35),  // Comédia
                ContentAPI.fetchByGenre(27),  // Terror
                ContentAPI.fetchByGenre(99),  // Documentário
                ContentAPI.fetchByGenre(878), // Ficção Científica
                ContentAPI.fetchByGenre(16),  // Animação
                ContentAPI.fetchByGenre(18)   // Drama
            ]);

            // Renderizar seções
            await Promise.all([
                this.renderContentSection('trending', trending.results),
                this.renderContentSection('new-releases', newReleases.results),
                this.renderContentSection('action-movies', action.results),
                this.renderContentSection('comedies', comedy.results),
                this.renderContentSection('horror', horror.results),
                this.renderContentSection('documentaries', documentary.results),
                this.renderContentSection('sci-fi', sciFi.results),
                this.renderContentSection('animation', animation.results),
                this.renderContentSection('drama', drama.results)
            ]);

            // Inicializar controles de slider
            this.initializeSliderControls();
        } catch (error) {
            console.error('Erro na inicialização do UIManager:', error);
            throw error;
        }
    }

    async setupHeroSection() {
        try {
            const trending = await ContentAPI.fetchTrending();
            const featuredItems = trending.results.slice(0, 5);
            
            if (featuredItems.length === 0) return;

            const slider = document.querySelector('.featured-slider');
            const controls = document.querySelector('.featured-controls');
            let currentSlide = 0;
            let autoplayInterval;
            let players = {};

            // Carregar API do YouTube primeiro
            await new Promise((resolve) => {
                if (window.YT) {
                    resolve();
                } else {
                    window.onYouTubeIframeAPIReady = resolve;
                    const tag = document.createElement('script');
                    tag.src = 'https://www.youtube.com/iframe_api';
                    const firstScriptTag = document.getElementsByTagName('script')[0];
                    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
                }
            });

            // Criar slides
            for (let i = 0; i < featuredItems.length; i++) {
                const featured = featuredItems[i];
                const details = await ContentAPI.fetchContentDetails(featured.id);
                
                if (!details) continue;

                const slide = document.createElement('div');
                slide.className = `featured-slide ${i === 0 ? 'active' : ''}`;
                
                slide.innerHTML = `
                    <div class="featured-backdrop">
                        <div class="video-wrapper" id="video-wrapper-${i}"></div>
                        <div class="featured-gradient"></div>
                    </div>
                    <div class="featured-content-info">
                        <h1 class="featured-title">${featured.title}</h1>
                        <p class="featured-description">${featured.overview || 'Descrição não disponível.'}</p>
                        <div class="featured-metadata">
                            <span class="rating" data-rating="${details.rating}">${details.rating}</span>
                            <span class="year">${new Date(featured.release_date).getFullYear()}</span>
                            <span class="duration">${details.runtime ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}min` : '2h'}</span>
                            <span class="quality">HD</span>
                        </div>
                        <div class="featured-buttons">
                            <button class="btn btn-play">
                                <span class="material-icons">play_arrow</span>
                                Assistir
                            </button>
                            <button class="btn btn-more-info">
                                <span class="material-icons">info</span>
                                Mais informações
                            </button>
                            <button class="btn btn-mute">
                                <span class="material-icons">volume_off</span>
                            </button>
                        </div>
                    </div>
                `;

                slider.appendChild(slide);

                // Criar indicador
                const indicator = document.createElement('div');
                indicator.className = `featured-indicator ${i === 0 ? 'active' : ''}`;
                indicator.addEventListener('click', () => goToSlide(i));
                controls.appendChild(indicator);

                // Configurar vídeo ou imagem de fundo
                const videoWrapper = slide.querySelector(`#video-wrapper-${i}`);
                const backdrop = slide.querySelector('.featured-backdrop');
                const muteButton = slide.querySelector('.btn-mute');
                const playButton = slide.querySelector('.btn-play');
                const moreInfoButton = slide.querySelector('.btn-more-info');

                if (details.videos && details.videos.results.length > 0) {
                    const trailer = details.videos.results.find(v => v.type === 'Trailer') || details.videos.results[0];
                    
                    // Criar player do YouTube
                    players[`featured-trailer-${i}`] = new YT.Player(`video-wrapper-${i}`, {
                        videoId: trailer.key,
                        playerVars: {
                            autoplay: i === 0 ? 1 : 0,
                            controls: 0,
                            showinfo: 0,
                            rel: 0,
                            loop: 1,
                            mute: 1,
                            playsinline: 1,
                            modestbranding: 1,
                            fs: 0,
                            origin: window.location.origin
                        },
                        events: {
                            onReady: (event) => {
                                if (i === 0) {
                                    event.target.playVideo();
                                }
                                if (UIManager.audioUnmuted) {
                                    event.target.unMute();
                                    event.target.setVolume(100);
                                }
                            },
                            onStateChange: (event) => {
                                if (event.data === YT.PlayerState.ENDED) {
                                    event.target.playVideo();
                                }
                            }
                        }
                    });

                    // Configurar botão de mudo
                    muteButton.addEventListener('click', () => {
                        UIManager.audioUnmuted = !UIManager.audioUnmuted;
                        // Atualizar todos os botões de mudo
                        document.querySelectorAll('.btn-mute .material-icons').forEach(icon => {
                            icon.textContent = UIManager.audioUnmuted ? 'volume_up' : 'volume_off';
                        });
                        // Atualizar o áudio do player atual
                        const player = players[`featured-trailer-${currentSlide}`];
                        if (player && typeof player.isMuted === 'function') {
                            if (UIManager.audioUnmuted) {
                                player.unMute();
                                player.setVolume(100);
                            } else {
                                player.mute();
                            }
                        }
                    });
                } else {
                    videoWrapper.style.display = 'none';
                    backdrop.style.background = `url(${IMAGE_BASE_URL}${featured.backdrop_path}) no-repeat center center`;
                    backdrop.style.backgroundSize = 'cover';
                    muteButton.style.display = 'none';
                }

                // Configurar botões
                playButton.addEventListener('click', async () => {
                    const details = await ContentAPI.fetchContentDetails(featured.id);
                    const hasTrailer = details?.videos?.results?.some(v => 
                        v.type === 'Trailer' && 
                        v.site === 'YouTube' && 
                        v.key && 
                        v.key.length > 0
                    );

                    const modal = $('#content-modal');
                    await UIManager.showContentDetails(featured);
                    
                    if (hasTrailer) {
                        modal.find('.btn-play').click();
                    }
                });

                moreInfoButton.addEventListener('click', () => {
                    UIManager.showContentDetails(featured);
                });
            }

            // Configurar navegação
            const prevButton = document.querySelector('.featured-arrow.prev');
            const nextButton = document.querySelector('.featured-arrow.next');

            function goToSlide(index) {
                const slides = document.querySelectorAll('.featured-slide');
                const indicators = document.querySelectorAll('.featured-indicator');
                
                if (index < 0) index = slides.length - 1;
                if (index >= slides.length) index = 0;

                document.querySelector('.featured-slide.active').classList.remove('active');
                document.querySelector('.featured-indicator.active').classList.remove('active');

                slides[index].classList.add('active');
                indicators[index].classList.add('active');

                // Gerenciar vídeos
                const prevPlayer = players[`featured-trailer-${currentSlide}`];
                const nextPlayer = players[`featured-trailer-${index}`];

                if (prevPlayer && typeof prevPlayer.pauseVideo === 'function') {
                    prevPlayer.pauseVideo();
                }

                if (nextPlayer && typeof nextPlayer.playVideo === 'function') {
                    nextPlayer.playVideo();
                    // Manter o estado do áudio ao trocar de slide
                    if (UIManager.audioUnmuted) {
                        nextPlayer.unMute();
                        nextPlayer.setVolume(100);
                    } else {
                        nextPlayer.mute();
                    }
                }

                currentSlide = index;
            }

            prevButton.addEventListener('click', () => {
                clearInterval(autoplayInterval);
                goToSlide(currentSlide - 1);
            });

            nextButton.addEventListener('click', () => {
                clearInterval(autoplayInterval);
                goToSlide(currentSlide + 1);
            });

        } catch (error) {
            console.error('Erro ao configurar seção em destaque:', error);
        }
    }

    initializeSliderControls() {
        document.querySelectorAll('.content-slider').forEach(slider => {
            const wrapper = slider.querySelector('.slider-wrapper');
            const row = slider.querySelector('.content-row');
            const prevBtn = slider.querySelector('.slider-arrow.prev');
            const nextBtn = slider.querySelector('.slider-arrow.next');
            
            let scrollAmount = 0;
            const cardWidth = row.children[0]?.offsetWidth || 200;
            const maxScroll = row.scrollWidth - wrapper.offsetWidth;

            // Ocultar seta prev inicialmente
            if (prevBtn) {
                prevBtn.style.display = 'none';
            }

            // Verificar se precisa mostrar a seta next
            if (nextBtn) {
                nextBtn.style.display = maxScroll <= 0 ? 'none' : 'block';
            }

            // Adicionar eventos de hover nos cards
            Array.from(row.children).forEach((card, index) => {
                card.addEventListener('mouseenter', () => {
                    const cardRect = card.getBoundingClientRect();
                    const wrapperRect = wrapper.getBoundingClientRect();
                    const margin = 60; // Margem para evitar que o card fique muito próximo da borda

                    // Se o card estiver próximo à seta da direita
                    if (cardRect.right > wrapperRect.right - margin && scrollAmount < maxScroll) {
                        const newScrollAmount = Math.min(scrollAmount + cardWidth, maxScroll);
                        scrollAmount = newScrollAmount;
                        row.style.transform = `translateX(-${scrollAmount}px)`;
                        
                        // Atualizar visibilidade das setas
                        if (prevBtn) prevBtn.style.display = 'block';
                        if (nextBtn) nextBtn.style.display = scrollAmount >= maxScroll ? 'none' : 'block';
                    }
                    
                    // Se o card estiver próximo à seta da esquerda
                    if (cardRect.left < wrapperRect.left + margin && scrollAmount > 0) {
                        const newScrollAmount = Math.max(scrollAmount - cardWidth, 0);
                        scrollAmount = newScrollAmount;
                        row.style.transform = `translateX(-${scrollAmount}px)`;
                        
                        // Atualizar visibilidade das setas
                        if (prevBtn) prevBtn.style.display = scrollAmount <= 0 ? 'none' : 'block';
                        if (nextBtn) nextBtn.style.display = 'block';
                    }
                });
            });

            prevBtn?.addEventListener('click', () => {
                scrollAmount = Math.max(scrollAmount - cardWidth * 4, 0);
                row.style.transform = `translateX(-${scrollAmount}px)`;

                // Atualizar visibilidade das setas
                if (prevBtn) {
                    prevBtn.style.display = scrollAmount <= 0 ? 'none' : 'block';
                }
                if (nextBtn) {
                    nextBtn.style.display = scrollAmount >= maxScroll ? 'none' : 'block';
                }
            });

            nextBtn?.addEventListener('click', () => {
                scrollAmount = Math.min(scrollAmount + cardWidth * 4, maxScroll);
                row.style.transform = `translateX(-${scrollAmount}px)`;

                // Atualizar visibilidade das setas
                if (prevBtn) {
                    prevBtn.style.display = scrollAmount <= 0 ? 'none' : 'block';
                }
                if (nextBtn) {
                    nextBtn.style.display = scrollAmount >= maxScroll ? 'none' : 'block';
                }
            });

            // Adicionar transição suave
            row.style.transition = 'transform 0.3s ease-out';

            // Atualizar setas quando a janela for redimensionada
            window.addEventListener('resize', () => {
                const newMaxScroll = row.scrollWidth - wrapper.offsetWidth;
                
                // Resetar posição se necessário
                if (scrollAmount > newMaxScroll) {
                    scrollAmount = newMaxScroll;
                    row.style.transform = `translateX(-${scrollAmount}px)`;
                }

                // Atualizar visibilidade das setas
                if (prevBtn) {
                    prevBtn.style.display = scrollAmount <= 0 ? 'none' : 'block';
                }
                if (nextBtn) {
                    nextBtn.style.display = scrollAmount >= newMaxScroll || newMaxScroll <= 0 ? 'none' : 'block';
                }
            });
        });
    }

    async renderContentSection(sectionId, movies) {
        try {
            const section = document.getElementById(sectionId);
            if (!section) return;

            const row = section.querySelector('.content-row');
            if (!row) return;

            // Limpar conteúdo existente
            row.innerHTML = '';

            // Criar e adicionar cards
            const cards = await Promise.all(movies.map(movie => this.createContentCard(movie)));
            cards.filter(card => card).forEach(card => row.appendChild(card));
        } catch (error) {
            console.error(`Erro ao renderizar seção ${sectionId}:`, error);
        }
    }

    async createContentCard(content) {
        try {
            const details = await ContentAPI.fetchContentDetails(content.id);
            const template = document.getElementById('content-card-template');
            const clone = template.content.cloneNode(true);
            const card = clone.querySelector('.content-card');
            
            // Configurar imagem
            const img = card.querySelector('.card-img');
            if (content.backdrop_path) {
                img.src = `${IMAGE_BASE_URL}${content.backdrop_path}`;
                img.alt = content.title || content.name;
                img.onerror = () => img.src = 'placeholder.jpg';
            }

            // Configurar título
            const titleElement = card.querySelector('.card-title');
            titleElement.textContent = content.title || content.name;

            // Configurar metadados
            card.querySelector('.match').textContent = `${Math.floor(content.vote_average * 10)}% relevante`;
            
            const ratingElement = card.querySelector('.rating');
            ratingElement.textContent = details?.rating || '14';
            ratingElement.dataset.rating = details?.rating || '14';
            
            card.querySelector('.duration').textContent = details?.runtime ? 
                `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}min` : '1h 30min';

            // Configurar gêneros
            const genresElement = card.querySelector('.genres');
            if (content.genre_ids && content.genre_ids.length > 0) {
                const genreNames = content.genre_ids
                    .slice(0, 3)
                    .map(id => UIManager.getGenreName(id))
                    .filter(name => name);
                genresElement.innerHTML = genreNames
                    .map(name => `<span>${name}</span>`)
                    .join('');
            }

            // Configurar botões
            const playButton = card.querySelector('.btn-play-small');
            const addButton = card.querySelector('.btn-add');
            const likeButton = card.querySelector('.btn-like');
            const moreButton = card.querySelector('.btn-more');

            playButton.addEventListener('click', async (e) => {
                e.stopPropagation();
                const details = await ContentAPI.fetchContentDetails(content.id);
                const hasTrailer = details?.videos?.results?.some(v => 
                    v.type === 'Trailer' && 
                    v.site === 'YouTube' && 
                    v.key && 
                    v.key.length > 0
                );

                const modal = $('#content-modal');
                await UIManager.showContentDetails(content);
                
                if (hasTrailer) {
                    modal.find('.btn-play').click();
                }
            });

            addButton.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('Add to list:', content.title);
            });

            likeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('Like:', content.title);
            });

            moreButton.addEventListener('click', (e) => {
                e.stopPropagation();
                UIManager.showContentDetails(content, details);
            });

            // Adicionar evento de clique no card
            card.addEventListener('click', () => UIManager.showContentDetails(content, details));

            return clone;
        } catch (error) {
            console.error('Erro ao criar card:', error);
            return null;
        }
    }

    static getGenreName(id) {
        const genreMap = {
            28: 'Ação',
            12: 'Aventura',
            16: 'Animação',
            35: 'Comédia',
            80: 'Crime',
            99: 'Documentário',
            18: 'Drama',
            10751: 'Família',
            14: 'Fantasia',
            36: 'História',
            27: 'Terror',
            10402: 'Música',
            9648: 'Mistério',
            10749: 'Romance',
            878: 'Ficção Científica',
            10770: 'Cinema TV',
            53: 'Thriller',
            10752: 'Guerra',
            37: 'Faroeste'
        };
        return genreMap[id] || '';
    }

    static async showContentDetails(content) {
        try {
            const details = await ContentAPI.fetchContentDetails(content.id);
            if (!details) return;

            const modal = $('#content-modal');
            const previewImg = modal.find('.preview-img');
            const videoContainer = modal.find('.video-container');
            const playerElement = document.querySelector('#player');

            // Limpar player anterior se existir
            if (this.player) {
                this.player.destroy();
                this.player = null;
                videoContainer.hide();
                previewImg.show();
                modal.find('.preview-overlay').show();
            }

            // Configurar informações básicas
            modal.find('.content-title').text(details.title);
            modal.find('.year').text(new Date(details.release_date).getFullYear());
            modal.find('.duration').text(details.runtime ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}min` : '');
            modal.find('.content-description').text(details.overview);

            // Configurar imagem de preview
            if (details.backdrop_path) {
                previewImg.attr('src', `${IMAGE_BASE_URL}${details.backdrop_path}`);
                previewImg.attr('alt', details.title);
                previewImg.show();
            } else {
                previewImg.hide();
            }

            // Procurar por um trailer válido
            let trailer = null;
            if (details.videos && details.videos.results) {
                trailer = details.videos.results.find(v => 
                    v.type === 'Trailer' && 
                    v.site === 'YouTube' && 
                    v.key && 
                    v.key.length > 0
                );
            }

            // Configurar botão de play
            const playButton = modal.find('.btn-play');
            
            if (trailer) {
                console.log('Trailer encontrado:', trailer.key, 'para', details.title);
                playButton.show();
                
                playButton.off('click').on('click', async () => {
                    try {
                        previewImg.hide();
                        modal.find('.preview-overlay').hide();
                        videoContainer.show();

                        // Configurar elemento do player
                        playerElement.setAttribute('data-plyr-embed-id', trailer.key);

                        // Criar novo player
                        this.player = new Plyr('#player', {
                            controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
                            youtube: {
                                noCookie: false,
                                rel: 0,
                                showinfo: 0,
                                iv_load_policy: 3,
                                modestbranding: 1,
                                playsinline: true,
                                origin: window.location.origin,
                                autoplay: 1
                            }
                        });

                        // Configurar fonte do vídeo
                        this.player.source = {
                            type: 'video',
                            sources: [{
                                src: `https://www.youtube.com/embed/${trailer.key}`,
                                provider: 'youtube'
                            }]
                        };

                        // Aguardar o player estar pronto
                        await new Promise((resolve) => {
                            this.player.on('ready', () => {
                                console.log('Player pronto para:', details.title);
                                resolve();
                            });
                        });

                        // Iniciar reprodução
                        try {
                            await this.player.play();
                            console.log('Reprodução iniciada para:', details.title);
                        } catch (error) {
                            console.error('Erro ao iniciar reprodução:', error);
                        }

                    } catch (error) {
                        console.error('Erro ao inicializar player:', error);
                        // Reverter para estado inicial em caso de erro
                        videoContainer.hide();
                        previewImg.show();
                        modal.find('.preview-overlay').show();
                    }
                });
            } else {
                console.log('Nenhum trailer disponível para:', details.title);
                playButton.hide();
            }

            // Configurar elenco
            const cast = details.credits?.cast?.slice(0, 5).map(actor => actor.name).join(', ');
            modal.find('.cast-list').text(cast || 'Informação não disponível');

            // Configurar gêneros
            const genres = details.genres?.map(genre => genre.name).join(', ');
            modal.find('.genre-list').text(genres || 'Informação não disponível');

            // Mostrar modal
            modal.modal('show');

            // Configurar evento de fechamento do modal
            modal.off('hidden.bs.modal').on('hidden.bs.modal', () => {
                if (this.player) {
                    this.player.destroy();
                    this.player = null;
                }
                videoContainer.hide();
                previewImg.show();
                modal.find('.preview-overlay').show();
            });

        } catch (error) {
            console.error('Erro ao mostrar detalhes:', error);
        }
    }

    static convertUSRatingToBR(usRating) {
        const ratingMap = {
            'G': 'L',
            'PG': '10',
            'PG-13': '12',
            'R': '16',
            'NC-17': '18'
        };
        return ratingMap[usRating] || '14';
    }

    setupHeroControls(slidesCount) {
        const prevButton = document.querySelector('.featured-arrow.prev');
        const nextButton = document.querySelector('.featured-arrow.next');
        const controls = document.querySelector('.featured-controls');

        // Limpar controles existentes
        controls.innerHTML = '';

        // Criar indicadores
        for (let i = 0; i < slidesCount; i++) {
            const indicator = document.createElement('div');
            indicator.className = `featured-indicator ${i === 0 ? 'active' : ''}`;
            indicator.addEventListener('click', () => this.goToSlide(i));
            controls.appendChild(indicator);
        }

        // Configurar botões de navegação
        prevButton?.addEventListener('click', () => {
            this.stopAutoplay();
            this.goToSlide(this.currentSlideIndex - 1);
        });

        nextButton?.addEventListener('click', () => {
            this.stopAutoplay();
            this.goToSlide(this.currentSlideIndex + 1);
        });
    }

    goToSlide(index) {
        const slides = document.querySelectorAll('.featured-slide');
        const indicators = document.querySelectorAll('.featured-indicator');

        if (index < 0) index = slides.length - 1;
        if (index >= slides.length) index = 0;

        // Remover classes ativas
        document.querySelector('.featured-slide.active')?.classList.remove('active');
        document.querySelector('.featured-indicator.active')?.classList.remove('active');

        // Ativar novo slide e indicador
        slides[index]?.classList.add('active');
        indicators[index]?.classList.add('active');

        this.currentSlideIndex = index;
    }

    startAutoplay() {
        this.stopAutoplay();
        this.autoplayInterval = setInterval(() => {
            this.goToSlide(this.currentSlideIndex + 1);
        }, 8000); // Trocar slide a cada 8 segundos
    }

    stopAutoplay() {
        if (this.autoplayInterval) {
            clearInterval(this.autoplayInterval);
            this.autoplayInterval = null;
        }
    }

    static createContentCard(content, details) {
        const template = document.getElementById('content-card-template');
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.content-card');
        
        // Configurar imagem
        const img = card.querySelector('.card-img');
        if (content.backdrop_path) {
            img.src = `${IMAGE_BASE_URL}${content.backdrop_path}`;
            img.alt = content.title || content.name;
            img.onerror = () => {
                img.src = content.poster_path ? 
                    `${IMAGE_BASE_URL}${content.poster_path}` : 
                    'placeholder.jpg';
            };
        }

        // Configurar metadados
        const match = card.querySelector('.match');
        match.textContent = `${Math.floor(content.vote_average * 10)}% relevante`;

        const rating = card.querySelector('.rating');
        if (details?.rating) {
            rating.textContent = details.rating;
            rating.dataset.rating = details.rating;
        }

        const duration = card.querySelector('.duration');
        duration.textContent = details?.runtime ? 
            `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}min` : 
            '1h 30min';

        // Configurar gêneros
        const genres = card.querySelector('.genres');
        if (details?.genres) {
            genres.innerHTML = details.genres
                .slice(0, 3)
                .map(genre => `<span>${genre.name}</span>`)
                .join('');
        }

        // Configurar botões
        const playButton = card.querySelector('.btn-play-small');
        playButton.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('Reproduzindo:', content.title);
        });

        const addButton = card.querySelector('.btn-add');
        addButton.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('Adicionado à lista:', content.title);
        });

        const likeButton = card.querySelector('.btn-like');
        likeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('Curtido:', content.title);
        });

        const moreButton = card.querySelector('.btn-more');
        moreButton.addEventListener('click', (e) => {
            e.stopPropagation();
            UIManager.showContentDetails(content, details);
        });

        // Adicionar evento de clique no card
        card.addEventListener('click', () => {
            UIManager.showContentDetails(content, details);
        });

        return clone;
    }

    static async renderContentSection(sectionId, content) {
        const container = document.querySelector(`#${sectionId} .content-row`);
        if (!container) return;

        container.innerHTML = '';
        
        if (!content || content.length === 0) return;

        // Buscar detalhes de todos os filmes em paralelo
        const detailsPromises = content.map(item => 
            ContentAPI.fetchContentDetails(item.id)
        );
        const details = await Promise.all(detailsPromises);

        content.forEach((item, index) => {
            const card = this.createContentCard(item, details[index]);
            container.appendChild(card);
        });

        this.setupSlider(sectionId);
    }
}

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    const preloader = document.querySelector('.preloader');

    try {
        // Esperar um pouco para garantir que o token foi carregado
        if (!window.ACCESS_TOKEN) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (!ContentAPI.getAccessToken()) {
            throw new Error('Token de acesso não disponvel. Verifique sua conexão e recarregue a página.');
        }

        const uiManager = new UIManager();
        await uiManager.initialize();

        // Esconder preloader após carregar tudo
        setTimeout(() => {
            preloader.classList.add('hidden');
            // Remover preloader do DOM após a animação
            setTimeout(() => {
                preloader.remove();
            }, 500);
        }, 500);

    } catch (error) {
        console.error('Erro ao inicializar o app:', error);
        alert('Erro ao inicializar o aplicativo. Por favor, recarregue a página.');
        // Esconder preloader mesmo em caso de erro
        preloader.classList.add('hidden');
    }

    // Efeito da navbar
    const navbar = document.querySelector('.navbar');
    let lastScrollPosition = window.scrollY;
    
    window.addEventListener('scroll', () => {
        const currentScrollPosition = window.scrollY;
        
        if (currentScrollPosition > 10) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        
        lastScrollPosition = currentScrollPosition;
    });

    // Controle da busca
    const searchToggle = document.querySelector('.search-toggle');
    const searchInput = document.querySelector('.search-input');
    const searchField = searchInput.querySelector('input');
    const searchResults = searchInput.querySelector('.search-results');

    let searchTimeout;

    searchToggle.addEventListener('click', () => {
        searchInput.classList.toggle('active');
        if (searchInput.classList.contains('active')) {
            searchField.focus();
        } else {
            searchResults.classList.remove('active');
            searchResults.innerHTML = '';
        }
    });

    // Fechar busca ao clicar fora
    document.addEventListener('click', (e) => {
        if (!searchToggle.contains(e.target) && !searchInput.contains(e.target)) {
            searchInput.classList.remove('active');
            searchResults.classList.remove('active');
            searchResults.innerHTML = '';
        }
    });

    // Fechar busca ao pressionar ESC
    searchField.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.classList.remove('active');
            searchResults.classList.remove('active');
            searchResults.innerHTML = '';
            searchField.blur();
        }
    });

    // Realizar busca
    searchField.addEventListener('input', async (e) => {
        const query = e.target.value;
        
        // Limpar timeout anterior
        clearTimeout(searchTimeout);

        // Aguardar um pouco antes de buscar
        searchTimeout = setTimeout(async () => {
            const results = await ContentAPI.searchContent(query);
            
            if (!query.trim()) {
                searchResults.classList.remove('active');
                searchResults.innerHTML = '';
                return;
            }

            searchResults.classList.add('active');
            
            if (results.results.length === 0) {
                searchResults.innerHTML = `
                    <div class="search-no-results">
                        Nenhum resultado encontrado para "${query}"
                    </div>
                `;
                return;
            }

            searchResults.innerHTML = results.results.map(item => `
                <div class="search-result-item" data-id="${item.id}" data-type="${item.media_type}">
                    <img 
                        src="${item.poster_path ? IMAGE_BASE_URL + item.poster_path : 'placeholder.jpg'}" 
                        alt="${item.title || item.name}"
                        class="search-result-img"
                        onerror="this.src='placeholder.jpg'"
                    >
                    <div class="search-result-info">
                        <h3 class="search-result-title">${item.title || item.name}</h3>
                        <div class="search-result-meta">
                            <span>${new Date(item.release_date || item.first_air_date).getFullYear() || 'N/A'}</span>
                            <span>${item.media_type === 'movie' ? 'Filme' : 'Série'}</span>
                        </div>
                    </div>
                </div>
            `).join('');

            // Adicionar evento de clique nos resultados
            searchResults.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const id = item.dataset.id;
                    const type = item.dataset.type;
                    
                    if (type === 'movie') {
                        await UIManager.showContentDetails({ id });
                        searchInput.classList.remove('active');
                        searchResults.classList.remove('active');
                        searchField.value = '';
                    }
                });
            });
        }, 300); // Aguardar 300ms após o usuário parar de digitar
    });
}); 